import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type {
  FileStorageObject,
  ImageAttachment,
  ImageMetadata,
  LinkAttachment,
  ShowAndTellEntry as ShowAndTellEntryModel,
  ShowAndTellEntryAttachment,
} from "@prisma/client";

import { env } from "@/env";

import {
  MAX_IMAGES,
  MAX_TEXT_HTML_LENGTH,
  MAX_VIDEOS,
  MYSQL_MAX_VARCHAR_LENGTH,
} from "@/data/show-and-tell";

import { sanitizeUserHtml } from "@/server/utils/sanitize-user-html";
import { prisma } from "@/server/db/client";
import { checkAndFixUploadedImageFileStorageObject } from "@/server/utils/file-storage";

import { parseVideoUrl, validateNormalizedVideoUrl } from "@/utils/video-urls";
import { getEntityStatus } from "@/utils/entity-helpers";
import { notEmpty } from "@/utils/helpers";

export type ImageAttachmentWithFileStorageObject = ImageAttachment & {
  fileStorageObject:
    | (FileStorageObject & { imageMetadata: ImageMetadata | null })
    | null;
};

export type FullShowAndTellEntryAttachment = ShowAndTellEntryAttachment & {
  linkAttachment: LinkAttachment | null;
  imageAttachment: ImageAttachmentWithFileStorageObject | null;
};

export type ShowAndTellEntryAttachments = Array<FullShowAndTellEntryAttachment>;

export type PublicShowAndTellEntry = Pick<
  ShowAndTellEntryModel,
  | "id"
  | "displayName"
  | "title"
  | "text"
  | "createdAt"
  | "updatedAt"
  | "approvedAt"
  | "seenOnStream"
  | "volunteeringMinutes"
  | "location"
>;

export type PublicShowAndTellEntryWithAttachments = PublicShowAndTellEntry & {
  attachments: ShowAndTellEntryAttachments;
};

export const withAttachments = {
  include: {
    attachments: {
      include: {
        linkAttachment: true,
        imageAttachment: {
          include: { fileStorageObject: { include: { imageMetadata: true } } },
        },
      },
    },
  },
};

export const whereApproved = {
  approvedAt: { gte: prisma.showAndTellEntry.fields.updatedAt },
};

function getPostFilter(filter: "approved" | "pendingApproval") {
  return filter === "pendingApproval"
    ? {
        OR: [
          { approvedAt: null },
          { approvedAt: { lt: prisma.showAndTellEntry.fields.updatedAt } },
        ],
      }
    : filter === "approved"
      ? { approvedAt: { gte: prisma.showAndTellEntry.fields.updatedAt } }
      : {};
}

const postOrderBy = [
  { seenOnStream: "asc" }, // make sure not yet seen posts are at the top
  { approvedAt: "desc" },
  { updatedAt: "desc" },
] as const;

const attachmentSchema = z.object({
  url: z.string().url(),
  title: z.string().max(100),
  caption: z.string().max(200),
  description: z.string().max(200),
  alternativeText: z.string().max(300),
});

type CreateImageAttachment = z.infer<typeof createImageAttachmentSchema>;
const createImageAttachmentSchema = attachmentSchema.and(
  z.object({
    fileStorageObjectId: z.string().cuid(),
    name: z.string(),
  }),
);

type VideoLink = z.infer<typeof videoLinkSchema>;
const videoLinkSchema = z.string().url().refine(validateNormalizedVideoUrl);
const videoLinksSchema = z.array(videoLinkSchema);

const imageAttachmentsSchema = z
  .object({
    create: z.array(createImageAttachmentSchema).max(MAX_IMAGES),
    update: z.record(z.string().cuid(), attachmentSchema),
  })
  .refine(
    ({ update, create }) =>
      Object.keys(update).length + create.length <= MAX_IMAGES,
    {
      message: `Too many image attachments. Max ${MAX_IMAGES}.`,
    },
  );

export type ShowAndTellSubmitInput = z.infer<
  typeof showAndTellSharedInputSchema
>;
const showAndTellSharedInputSchema = z.object({
  displayName: z.string().max(100),
  title: z.string().max(100),
  text: z.string().max(MAX_TEXT_HTML_LENGTH),
  imageAttachments: imageAttachmentsSchema,
  videoLinks: videoLinksSchema.max(MAX_VIDEOS),
  volunteeringMinutes: z.number().int().positive().nullable(),
  location: z.string().max(MYSQL_MAX_VARCHAR_LENGTH).nullable(),
  longitude: z.number().nullable(),
  latitude: z.number().nullable(),
});

export const showAndTellCreateInputSchema = showAndTellSharedInputSchema;

export type ShowAndTellUpdateInput = z.infer<
  typeof showAndTellUpdateInputSchema
>;
export const showAndTellUpdateInputSchema = showAndTellSharedInputSchema.and(
  z.object({
    id: z.string().cuid(),
  }),
);

async function revalidateCache(postIdOrIds?: string | string[]) {
  const url = new URL(
    `${env.NEXT_PUBLIC_BASE_URL}/api/show-and-tell/revalidate`,
  );
  url.searchParams.set("secret", env.ACTION_API_SECRET);

  if (postIdOrIds) {
    if (typeof postIdOrIds === "string") {
      url.searchParams.set("postId", postIdOrIds);
    } else {
      postIdOrIds.forEach((postId) =>
        url.searchParams.append("postId", postId),
      );
    }
  }

  return fetch(url);
}

function createLinkAttachmentForVideoUrl(videoUrl: string, idx: number) {
  return {
    attachmentType: "video",
    linkAttachment: {
      create: {
        type: parseVideoUrl(videoUrl)?.platform || "video",
        url: videoUrl,
        title: `Video ${idx + 1}`,
        name: `Video ${idx + 1}`,
        caption: "",
        alternativeText: "",
        description: "",
      },
    },
  };
}

async function createImageAttachment(attachment: CreateImageAttachment) {
  const { error } = await checkAndFixUploadedImageFileStorageObject(
    attachment.fileStorageObjectId,
  );

  if (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Error uploading file: ${error}`,
    });
  }

  const imageAttachment = await prisma.imageAttachment.create({
    data: attachment,
  });

  return {
    attachmentType: "image",
    imageAttachment: { connect: { id: imageAttachment.id } },
  };
}

async function createImageAttachments(
  attachmentsToCreate: Array<CreateImageAttachment>,
) {
  // Check and fix new uploaded image attachments
  return Promise.all(attachmentsToCreate.map(createImageAttachment));
}

function createVideoAttachments(videoLinks: Array<VideoLink>) {
  return videoLinks.map((videoUrl, idx) =>
    createLinkAttachmentForVideoUrl(videoUrl, idx),
  );
}

export async function createPost(
  input: ShowAndTellSubmitInput,
  authorUserId?: string,
  importAt?: Date,
) {
  const text = sanitizeUserHtml(input.text);
  const newImages = await createImageAttachments(input.imageAttachments.create);
  const newVideos = createVideoAttachments(input.videoLinks);

  // TODO: Webhook? Notify mods?
  const res = await prisma.showAndTellEntry.create({
    data: {
      ...(importAt
        ? {
            createdAt: importAt,
            updatedAt: importAt,
            approvedAt: importAt,
          }
        : {}),
      user: authorUserId ? { connect: { id: authorUserId } } : undefined,
      displayName: input.displayName,
      title: input.title,
      text,
      volunteeringMinutes: input.volunteeringMinutes,
      attachments: { create: [...newImages, ...newVideos] },
      location: input.location,
      longitude: input.longitude,
      latitude: input.latitude,
    },
  });
  await revalidateCache(res.id);
  return res;
}

export async function getPublicPostById(id: string) {
  return prisma.showAndTellEntry.findFirst({
    include: {
      ...withAttachments.include,
    },
    where: {
      ...whereApproved,
      id,
    },
  });
}

export async function getPostWithUserById(id: string, authorUserId?: string) {
  return prisma.showAndTellEntry.findFirst({
    include: {
      ...withAttachments.include,
      user: true,
    },
    where: {
      userId: authorUserId,
      id,
    },
  });
}

export async function getPosts({
  take,
  cursor,
}: {
  take?: number;
  cursor?: string;
} = {}) {
  return prisma.showAndTellEntry.findMany({
    where: getPostFilter("approved"),
    select: {
      id: true,
      displayName: true,
      title: true,
      text: true,
      volunteeringMinutes: true,
      seenOnStream: true,
      createdAt: true,
      updatedAt: true,
      approvedAt: true,
      attachments: withAttachments.include.attachments,
      location: true,
    },
    orderBy: [...postOrderBy],
    cursor: cursor ? { id: cursor } : undefined,
    take,
  });
}

export async function getPostsCount() {
  return prisma.showAndTellEntry.count({
    where: getPostFilter("approved"),
  });
}

export async function getUsersCount() {
  const [countWithUserId, countWithoutUserId] = await Promise.all([
    prisma.showAndTellEntry.findMany({
      select: { id: true },
      where: {
        userId: {
          not: null,
        },
        AND: getPostFilter("approved"),
      },
      distinct: ["userId"],
    }),
    prisma.showAndTellEntry.findMany({
      select: { id: true },
      where: {
        userId: null,
        AND: getPostFilter("approved"),
      },
      distinct: ["displayName"],
    }),
  ] as const);

  return countWithUserId.length + countWithoutUserId.length;
}

export async function getVolunteeringMinutes() {
  const res = await prisma.showAndTellEntry.aggregate({
    _sum: { volunteeringMinutes: true },
    where: getPostFilter("approved"),
  });

  return res._sum.volunteeringMinutes ?? 0;
}

export async function getAdminPosts({
  take,
  cursor,
  filter = "approved",
}: {
  take?: number;
  cursor?: string;
  filter?: "approved" | "pendingApproval";
} = {}) {
  return prisma.showAndTellEntry.findMany({
    where: getPostFilter(filter),
    orderBy: [...postOrderBy],
    include: { user: true },
    cursor: cursor ? { id: cursor } : undefined,
    take,
  });
}

export async function updatePost(
  input: ShowAndTellUpdateInput,
  authorUserId?: string,
  keepApproved?: boolean,
) {
  // check that the user is the owner of the entry
  // and that the entry has not been deleted
  const existingEntry = await prisma.showAndTellEntry.findFirstOrThrow({
    where: {
      id: input.id,
      userId: authorUserId,
    },
    include: { attachments: true },
  });

  // Check that the only existing image attachments that are connected to the entry are updated
  for (const id of Object.keys(input.imageAttachments.update)) {
    if (!existingEntry.attachments.find((a) => a.imageAttachmentId === id)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Tried to update attachment that is not connected to the entry.`,
      });
    }
  }

  const text = sanitizeUserHtml(input.text);
  const newImages = await createImageAttachments(input.imageAttachments.create);
  const newVideos = createVideoAttachments(input.videoLinks);

  const now = new Date();
  const wasApproved = getEntityStatus(existingEntry) === "approved";

  // TODO: Webhook? Notify mods?
  await Promise.allSettled([
    prisma.showAndTellEntry.update({
      where: {
        id: input.id,
      },
      data: {
        displayName: input.displayName,
        title: input.title,
        text,
        volunteeringMinutes: input.volunteeringMinutes,
        updatedAt: now,
        approvedAt:
          keepApproved && wasApproved ? now : existingEntry.approvedAt,
        attachments: {
          deleteMany: {
            OR: [
              // Delete all video attachments (we add them back later if they are still in the input)
              { attachmentType: "video", linkAttachmentId: { not: null } },
              // Delete image attachments that are no longer in the update list
              {
                attachmentType: "image",
                imageAttachmentId: {
                  notIn: Object.keys(input.imageAttachments.update),
                },
              },
            ],
          },
          // Create attachments that are in the creation list
          create: [...newImages, ...newVideos],
        },
        location: input.location,
        longitude: input.longitude,
        latitude: input.latitude,
      },
    }),
    // Update image attachments that are in the update list
    ...Object.entries(input.imageAttachments.update).map(([id, attachment]) =>
      prisma.imageAttachment.update({
        where: { id },
        data: attachment,
      }),
    ),
  ]);
  await revalidateCache(input.id);
}

export async function approvePost(id: string, authorUserId?: string) {
  await prisma.showAndTellEntry.updateMany({
    where: { id, user: authorUserId ? { id: authorUserId } : undefined },
    data: {
      approvedAt: new Date(),
    },
  });
  await revalidateCache(id);
}

export async function removeApprovalFromPost(
  id: string,
  authorUserId?: string,
) {
  await prisma.showAndTellEntry.updateMany({
    where: { id, user: authorUserId ? { id: authorUserId } : undefined },
    data: {
      approvedAt: null,
    },
  });
  await revalidateCache(id);
}

export async function markPostAsSeen(id: string, retroactive = false) {
  if (!retroactive) {
    await prisma.showAndTellEntry.update({
      where: { id },
      data: {
        seenOnStream: true,
        seenOnStreamAt: new Date(),
      },
    });
    await revalidateCache(id);
    return;
  }

  const entry = await prisma.showAndTellEntry.findUniqueOrThrow({
    select: { approvedAt: true },
    where: { id },
  });
  if (!entry.approvedAt) return;

  const ids = (
    await prisma.showAndTellEntry.findMany({
      select: { id: true },
      where: {
        AND: [whereApproved, { approvedAt: { lte: entry.approvedAt } }],
      },
    })
  ).map((e) => e.id);
  await prisma.showAndTellEntry.updateMany({
    where: { id: { in: [id, ...ids] } },
    data: {
      seenOnStream: true,
      seenOnStreamAt: new Date(),
    },
  });

  await revalidateCache([id, ...ids]);
}

export async function unmarkPostAsSeen(id: string) {
  await prisma.showAndTellEntry.update({
    where: { id },
    data: {
      seenOnStream: false,
      seenOnStreamAt: null,
    },
  });
  await revalidateCache(id);
}

export async function deletePost(id: string, authorUserId?: string) {
  const post = await getPostWithUserById(id, authorUserId);
  if (!post) return false;

  await Promise.allSettled([
    prisma.showAndTellEntry.delete({ where: { id: post.id } }),
    prisma.imageAttachment.deleteMany({
      where: {
        id: {
          in: post.attachments.map((a) => a.imageAttachmentId).filter(notEmpty),
        },
      },
    }),
    prisma.linkAttachment.deleteMany({
      where: {
        id: {
          in: post.attachments.map((a) => a.linkAttachmentId).filter(notEmpty),
        },
      },
    }),
  ]);
  await revalidateCache(id);
}

export async function getPostsToShow() {
  const postsToShow = await prisma.showAndTellEntry.count({
    where: {
      AND: [whereApproved, { seenOnStream: false }],
    },
  });

  return postsToShow;
}

export type LocationFeature = {
  id: string;
  location: string;
  latitude: number;
  longitude: number;
};

export async function getMapFeatures() {
  return (await prisma.showAndTellEntry.findMany({
    where: {
      ...whereApproved,
      longitude: { not: null },
      latitude: { not: null },
    },
    select: {
      id: true,
      location: true,
      latitude: true,
      longitude: true,
    },
  })) as LocationFeature[];
}
