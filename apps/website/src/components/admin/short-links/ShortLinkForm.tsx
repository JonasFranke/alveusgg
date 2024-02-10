import type { FormEvent } from "react";
import { useCallback, useState } from "react";

import type { ShortLinks } from "@prisma/client";
import { useRouter } from "next/router";

import { env } from "@/env/index.mjs";

import { trpc } from "@/utils/trpc";
import { convertToSlug, SLUG_PATTERN } from "@/utils/slugs";

import { type FormSchema } from "@/server/db/short-links";

import { Button, defaultButtonClasses } from "@/components/shared/Button";
import { TextField } from "@/components/shared/form/TextField";
import { Fieldset } from "@/components/shared/form/Fieldset";
import { MessageBox } from "@/components/shared/MessageBox";

type FormFormProps = {
  action: "create" | "edit";
  form?: ShortLinks;
};

export function ShortLinkForm({ action, form }: FormFormProps) {
  const router = useRouter();
  const submit = trpc.adminShortLinks.createOrEditForm.useMutation();

  const [label, setLabel] = useState(form?.label || "");

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const formData = new FormData(event.currentTarget);

      //Add https:// if not present
      const link =
        String(formData.get("url")).startsWith("http://") ||
        String(formData.get("url")).startsWith("https://")
          ? String(formData.get("url"))
          : "https://" + String(formData.get("url"));

      const mutationData: FormSchema = {
        label: String(formData.get("label")),
        link: link,
        config: {
          checks: formData.get("checks") === "true",
          rules: formData.has("rules")
            ? String(formData.get("rules"))
            : undefined,
        },
      };

      const slug = formData.has("slug") && String(formData.get("slug"));
      if (slug && slug !== "") {
        mutationData.slug = slug;
      }

      if (action === "edit") {
        if (!form) return;
        submit.mutate({ action: "edit", id: form.id, ...mutationData });
      } else {
        submit.mutate(
          { action: "create", ...mutationData },
          {
            onSuccess: async () => {
              await router.push(`/admin/short-links`);
            },
          },
        );
      }
    },
    [action, form, router, submit],
  );

  return (
    <form className="flex flex-col gap-10" onSubmit={handleSubmit}>
      {submit.error && (
        <MessageBox variant="failure">
          <pre>{submit.error.message}</pre>
        </MessageBox>
      )}
      {submit.isSuccess && (
        <MessageBox variant="success">Form updated!</MessageBox>
      )}

      <Fieldset legend="Form">
        <TextField
          label="Name"
          name="label"
          value={label}
          onChange={setLabel}
        />
        <TextField
          label="Slug (Public URL, alphanumeric, dashes allowed)"
          name="slug"
          pattern={SLUG_PATTERN}
          inputMode="url"
          defaultValue={form?.slug || ""}
          inputClassName="font-mono"
          placeholder={convertToSlug(label)}
          prefix={
            <div className="cursor-default select-none pl-2 font-mono">{`${env.NEXT_PUBLIC_BASE_URL}/link/`}</div>
          }
        />
        <TextField
          label="URL"
          name="url"
          inputMode="url"
          inputClassName="font-mono"
          placeholder="https://twitch.tv/alveussanctuary"
        />
      </Fieldset>

      <Button type="submit" className={defaultButtonClasses}>
        {action === "create" ? "Create" : "Update"}
      </Button>
    </form>
  );
}
