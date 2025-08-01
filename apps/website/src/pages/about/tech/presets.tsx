import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Field,
  Input,
  Label,
  Switch,
} from "@headlessui/react";
import { type NextPage } from "next";
import Image, { type StaticImageData } from "next/image";
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import cameras, { type Camera } from "@/data/tech/cameras";
import type { CameraMulti, CameraPTZ } from "@/data/tech/cameras.types";
import { channels, scopeGroups } from "@/data/twitch";

import { classes } from "@/utils/classes";
import {
  isDefinedEntry,
  safeJSONParse,
  typeSafeObjectEntries,
  typeSafeObjectKeys,
} from "@/utils/helpers";
import { camelToKebab, camelToTitle } from "@/utils/string-case";
import { type RouterInputs, trpc } from "@/utils/trpc";

import Box from "@/components/content/Box";
import Heading from "@/components/content/Heading";
import Link from "@/components/content/Link";
import Meta from "@/components/content/Meta";
import Moveable from "@/components/content/Moveable";
import Section from "@/components/content/Section";
import Twitch from "@/components/content/Twitch";
import ProvideAuth from "@/components/shared/LoginWithExtraScopes";
import CopyToClipboardButton from "@/components/shared/actions/CopyToClipboardButton";
import RunCommandButton from "@/components/shared/actions/RunCommandButton";

import IconCheck from "@/icons/IconCheck";
import IconChevronDown from "@/icons/IconChevronDown";
import IconLoading from "@/icons/IconLoading";
import IconVideoCamera from "@/icons/IconVideoCamera";
import IconX from "@/icons/IconX";

import leafLeftImage1 from "@/assets/floral/leaf-left-1.png";
import leafLeftImage3 from "@/assets/floral/leaf-left-3.png";
import leafRightImage2 from "@/assets/floral/leaf-right-2.png";

type Command = RouterInputs["stream"]["runCommand"];

const Button = ({
  camera,
  title,
  group,
  onClick,
  selected,
}: {
  camera: Camera;
  title: string;
  group: string;
  onClick: () => void;
  selected: {
    camera: Camera;
    group: string;
  };
}) => (
  <div className="flex w-full overflow-hidden rounded shadow-md">
    <button
      onClick={onClick}
      className={classes(
        "my-auto grow px-3 py-2 text-left text-lg font-semibold backdrop-blur-sm",
        camera === selected.camera
          ? "bg-alveus-green/75 text-white"
          : "bg-alveus-green-50/75 hover:bg-alveus-green-100/90",
      )}
    >
      {title}
      <span className="text-sm text-alveus-green-400 italic">
        {` (${camera.toLowerCase()})`}
      </span>
    </button>

    {camera !== selected.camera && group === selected.group && (
      <RunCommandButton
        command="swap"
        args={[selected.camera.toLowerCase(), camera.toLowerCase()]}
        subOnly
        tooltip="Run swap command"
        className="flex items-center rounded-r bg-alveus-green/75 px-2 text-alveus-tan backdrop-blur-sm transition-colors hover:bg-alveus-green-900/90"
      />
    )}
  </div>
);

const Card = ({
  title,
  image,
  command,
  className,
  children,
}: {
  title: string;
  image?: { src: StaticImageData; alt: string };
  command?: Command;
  className?: string;
  children?: ReactNode;
}) => (
  <div
    className={classes(
      "rounded-lg border border-alveus-green-900 shadow-lg",
      className,
    )}
  >
    <div className="group relative aspect-video overflow-hidden rounded-t-lg">
      {image ? (
        <Image
          src={image.src}
          alt={image.alt}
          fill
          className="aspect-video w-full object-cover transition-transform"
        />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-alveus-green-50 text-xs text-alveus-green-300">
          No Image
        </div>
      )}
    </div>
    <div className="flex flex-col gap-1 rounded-b-lg bg-alveus-tan p-2">
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-semibold">{title}</h4>
        {command && (
          <div className="flex gap-1">
            <CopyToClipboardButton
              text={`!${[command.command, ...(command.args ?? [])].join(" ")}`}
              options={{ initialText: "Copy command" }}
              preview
            />
            <RunCommandButton
              command={command.command}
              args={command.args}
              subOnly
            />
          </div>
        )}
      </div>
      <p className="text-sm text-alveus-green-600 italic">{children}</p>
    </div>
  </div>
);

const AboutTechPresetsPage: NextPage = () => {
  const { data: session } = trpc.auth.getSession.useQuery();
  const subscription = trpc.stream.getSubscription.useQuery(undefined, {
    enabled: scopeGroups.chat.every((scope) =>
      session?.user?.scopes?.includes(scope),
    ),
  });

  // Track all the disclosure buttons so we can open/close them based on search input
  const disclosures = useRef<Set<HTMLButtonElement>>(new Set());
  const disclosureRef = useCallback((el: HTMLButtonElement) => {
    disclosures.current.add(el);
    return () => {
      disclosures.current.delete(el);
    };
  }, []);

  const [searchCamera, setSearchCamera] = useState("");
  const searchCameraSanitized = searchCamera.trim().toLowerCase();
  useEffect(() => {
    // If we have a search term, open all the disclosures that're rendered
    if (searchCameraSanitized.length > 0) {
      disclosures.current.forEach((el) => {
        if (el instanceof HTMLButtonElement && !("open" in el.dataset)) {
          el.click();
        }
      });
      return;
    }

    // If we have no search term, close all disclosures
    disclosures.current.forEach((el) => {
      if (el instanceof HTMLButtonElement && "open" in el.dataset) {
        el.click();
      }
    });
  }, [searchCameraSanitized]);

  // Filer the cameras based on the search term and group them
  const groupedCameras = useMemo(
    () =>
      typeSafeObjectEntries(cameras).reduce(
        (acc, [key, value]) =>
          !searchCameraSanitized.length ||
          value.title.toLowerCase().includes(searchCameraSanitized)
            ? {
                ...acc,
                [value.group]: {
                  ...acc[value.group],
                  [key]: value,
                },
              }
            : acc,
        {} as Record<string, Partial<typeof cameras>>,
      ),
    [searchCameraSanitized],
  );

  const [selectedCamera, setSelectedCamera] = useState<Camera>(
    typeSafeObjectKeys(cameras)[0]!,
  );
  const selectedData = cameras[selectedCamera] as CameraPTZ | CameraMulti;

  const [searchPresets, setSearchPresets] = useState("");
  const searchPresetsSanitized = searchPresets.trim().toLowerCase();
  useEffect(() => {
    // Reset the search presets when the selected camera changes
    setSearchPresets("");
  }, [selectedCamera]);

  const [twitchEmbed, setTwitchEmbed] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("presets:twitch-embed");
      const parsed = safeJSONParse(saved ?? "");
      if (typeof parsed === "boolean") return parsed;
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("presets:twitch-embed", JSON.stringify(twitchEmbed));
  }, [twitchEmbed]);

  return (
    <>
      <Meta
        title="Camera Presets at Alveus"
        description="Control the cameras on the Alveus Sanctuary livestream by loading preset positions. Preview all the available camera presets and run chat commands directly from this page to change the camera views."
      />

      {/* Nav background */}
      <div className="-mt-40 hidden h-40 bg-alveus-green-900 lg:block" />

      <div className="relative">
        <Image
          src={leafLeftImage1}
          alt=""
          className="pointer-events-none absolute right-0 -bottom-32 z-10 hidden h-auto w-1/2 max-w-48 -scale-x-100 drop-shadow-md select-none lg:block"
        />

        <Section dark className="py-24">
          <div className="w-full lg:w-3/5">
            <Heading level={1}>Camera Presets at Alveus</Heading>
            <p className="text-lg text-balance">
              Control the cameras on the livestream by loading preset positions
              for the cameras if you&apos;re subscribed to{" "}
              <Link href="/live/twitch" external dark>
                Alveus Sanctuary on Twitch
              </Link>
              .
            </p>
          </div>
        </Section>
      </div>

      {/* Grow the last section to cover the page */}
      <div className="relative flex grow flex-col">
        <Image
          src={leafLeftImage3}
          alt=""
          className="pointer-events-none absolute right-0 -bottom-24 z-10 hidden h-auto w-1/2 max-w-48 -scale-x-100 drop-shadow-md select-none lg:block"
        />

        <Section className="grow">
          <div className="flex flex-col gap-y-4 lg:flex-row">
            <div className="flex w-full flex-col gap-2 lg:w-3/5">
              <p>
                If you&apos;re subscribed, you can run these commands directly
                from this page by clicking the{" "}
                <span className="font-semibold text-alveus-green">
                  Run command{" "}
                  <IconVideoCamera className="mb-0.5 inline-block size-4" />
                </span>{" "}
                button in each preset card. This will automatically send the
                command to the{" "}
                <Link
                  href={`https://twitch.tv/${channels.alveusgg.username}`}
                  external
                >
                  {channels.alveusgg.username} Twitch chat
                </Link>{" "}
                as if you had typed it in the chat yourself.
              </p>

              <p className="hidden lg:block">
                Next to each camera in the menu you&apos;ll also find a{" "}
                <span className="font-semibold text-alveus-green">
                  Run swap command{" "}
                  <IconVideoCamera className="mb-0.5 inline-block size-4" />
                </span>{" "}
                button if the camera is in the same enclosure as the currently
                selected camera, allowing you to swap which camera is shown on
                stream if you&apos;re subscribed.
              </p>

              <p>
                Make sure to enable the embedded stream player, or have the{" "}
                <Link href="/live/twitch" external>
                  livestream
                </Link>{" "}
                open in another tab, to see the cameras change as you load
                presets
                <span className="hidden lg:inline">
                  {" "}
                  and swap which cameras are on stream
                </span>
                .
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 lg:w-2/5 lg:px-8">
              <ProvideAuth scopeGroup="chat" className="mb-4" />

              {!subscription.isPaused && (
                <div
                  className={classes(
                    "flex items-center justify-between rounded-xl p-3 text-lg text-alveus-tan",
                    subscription.isSuccess &&
                      (subscription.data ? "bg-alveus-green" : "bg-red"),
                    subscription.isLoading && "bg-twitch",
                    subscription.isError && "bg-red",
                  )}
                >
                  <p>
                    {subscription.isSuccess &&
                      (subscription.data
                        ? `@${session?.user?.name} is subscribed at Tier ${subscription.data.tier.replace(/0+$/, "")}`
                        : `@${session?.user?.name} is not subscribed`)}

                    {subscription.isLoading &&
                      "Checking subscription status..."}
                    {subscription.isError &&
                      "Failed to check subscription status"}
                  </p>

                  {subscription.isSuccess &&
                    (subscription.data ? (
                      <IconCheck className="size-6" />
                    ) : (
                      <IconX className="size-6" />
                    ))}

                  {subscription.isLoading && (
                    <IconLoading className="size-6 animate-spin" />
                  )}
                  {subscription.isError && <IconX className="size-6" />}
                </div>
              )}

              {subscription.isSuccess && subscription.data && (
                <Field className="mt-auto hidden items-center gap-2 lg:flex">
                  <Switch
                    checked={twitchEmbed}
                    onChange={setTwitchEmbed}
                    className="group inline-flex h-6 w-11 items-center rounded-full bg-alveus-green-300 transition-colors data-checked:bg-alveus-green"
                  >
                    <span className="size-4 translate-x-1 rounded-full bg-alveus-tan transition-transform group-data-checked:translate-x-6" />
                  </Switch>
                  <Label className="flex flex-col leading-tight">
                    <span>Enable embedded Twitch stream player</span>
                    <span className="text-sm text-alveus-green-400 italic">
                      (drag to move; hold shift to interact with player)
                    </span>
                  </Label>
                </Field>
              )}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-4">
            {/* Camera List */}
            <div className="col-span-1 space-y-2 lg:sticky lg:top-0">
              {/* Mobile: Dropdown */}
              <div className="mb-2 block lg:hidden">
                <label htmlFor="camera-select" className="sr-only">
                  Select Camera
                </label>
                <select
                  id="camera-select"
                  value={selectedCamera}
                  onChange={(e) => setSelectedCamera(e.target.value as Camera)}
                  className="w-full rounded border border-alveus-green-200 bg-alveus-green-50 px-3 py-2 text-lg font-semibold focus:ring-2 focus:ring-alveus-green focus:outline-none"
                >
                  {Object.values(groupedCameras)
                    .flatMap((group) => typeSafeObjectKeys(group))
                    .map((camera) => (
                      <option key={camera} value={camera}>
                        {cameras[camera].title} ({camera.toLowerCase()})
                      </option>
                    ))}
                </select>
              </div>

              {/* Desktop: Button List */}
              <div className="relative hidden lg:flex lg:flex-col lg:gap-1">
                <Image
                  src={leafRightImage2}
                  alt=""
                  className="pointer-events-none absolute top-0 left-0 -z-10 h-96 max-h-full w-auto -translate-x-1/2 drop-shadow-md select-none"
                />

                <Input
                  type="text"
                  placeholder="Search cameras..."
                  aria-label="Search cameras"
                  value={searchCamera}
                  onChange={(e) => setSearchCamera(e.target.value)}
                  className="mb-2 w-full rounded border border-alveus-green-200 bg-alveus-green-50/75 px-2 py-1 font-semibold shadow-md backdrop-blur-sm focus:ring-2 focus:ring-alveus-green focus:outline-none"
                />

                {typeSafeObjectEntries(groupedCameras).map(([name, group]) => {
                  const groupEntries =
                    typeSafeObjectEntries(group).filter(isDefinedEntry);
                  if (groupEntries.length === 0) return null;

                  if (groupEntries.length === 1) {
                    const [camera, { title, group }] = groupEntries[0]!;
                    return (
                      <Button
                        key={camera}
                        camera={camera}
                        title={title}
                        group={group}
                        onClick={() => setSelectedCamera(camera)}
                        selected={{
                          camera: selectedCamera,
                          group: selectedData.group,
                        }}
                      />
                    );
                  }

                  return (
                    <Disclosure key={name}>
                      <DisclosureButton
                        ref={disclosureRef}
                        className={classes(
                          "group flex w-full items-center justify-between rounded px-3 py-2 text-left text-lg font-semibold shadow-md backdrop-blur-sm",
                          selectedData.group === name
                            ? "bg-alveus-green/75 text-white"
                            : "bg-alveus-green-50/75 hover:bg-alveus-green-100/90",
                        )}
                      >
                        <span>
                          {camelToTitle(name)} Cameras
                          <span className="text-sm text-alveus-green-400 italic">
                            {` (${groupEntries.length})`}
                          </span>
                        </span>
                        <IconChevronDown className="ml-auto size-5 group-data-[open]:-scale-y-100" />
                      </DisclosureButton>
                      <DisclosurePanel className="ml-4 flex flex-col gap-1">
                        {groupEntries.map(([camera, { title, group }]) => (
                          <Button
                            key={camera}
                            camera={camera}
                            title={title}
                            group={group}
                            onClick={() => setSelectedCamera(camera)}
                            selected={{
                              camera: selectedCamera,
                              group: selectedData.group,
                            }}
                          />
                        ))}
                      </DisclosurePanel>
                    </Disclosure>
                  );
                })}
              </div>
            </div>

            {/* Preset List */}
            <div className="col-span-1 lg:sticky lg:top-0 lg:col-span-3">
              {selectedCamera && (
                <Fragment key={selectedCamera}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Heading
                      level={3}
                      className="my-0 shrink-0 scroll-mt-14 text-2xl"
                      id={`presets:${camelToKebab(selectedCamera)}`}
                    >
                      {selectedData.title}
                      <span className="text-sm text-alveus-green-400 italic">
                        {` (${selectedCamera.toLowerCase()})`}
                      </span>
                    </Heading>

                    {"presets" in selectedData && (
                      <Input
                        type="text"
                        placeholder="Search presets..."
                        aria-label="Search presets"
                        value={searchPresets}
                        onChange={(e) => setSearchPresets(e.target.value)}
                        className="grow rounded border border-alveus-green-200 bg-alveus-green-50/75 px-2 py-1 font-semibold shadow-md backdrop-blur-sm focus:ring-2 focus:ring-alveus-green focus:outline-none"
                      />
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {"presets" in selectedData &&
                      typeSafeObjectEntries(selectedData.presets)
                        .filter(
                          ([name, preset]) =>
                            !searchPresetsSanitized.length ||
                            name
                              .toLowerCase()
                              .includes(searchPresetsSanitized) ||
                            preset.description
                              .toLowerCase()
                              .includes(searchPresetsSanitized),
                        )
                        .map(([name, preset]) => (
                          <Card
                            key={name}
                            title={name}
                            image={
                              preset.image
                                ? { src: preset.image, alt: preset.description }
                                : undefined
                            }
                            command={{
                              command: "ptzload",
                              args: [selectedCamera.toLowerCase(), name],
                            }}
                          >
                            {preset.description}
                          </Card>
                        ))}

                    {"multi" in selectedData && (
                      <Card
                        title={selectedData.multi.cameras.join(" + ")}
                        image={
                          selectedData.multi.image
                            ? {
                                src: selectedData.multi.image,
                                alt:
                                  selectedData.multi.description ??
                                  selectedData.multi.cameras.join(" + "),
                              }
                            : undefined
                        }
                        className="col-span-2"
                      >
                        {selectedData.multi.description}
                      </Card>
                    )}
                  </div>
                </Fragment>
              )}
            </div>
          </div>
        </Section>
      </div>

      {subscription.isSuccess && subscription.data && twitchEmbed && (
        <Moveable
          className="right-2 bottom-2 z-50 w-2xl rounded-xl shadow-xl"
          fixed
          store="presets:twitch-embed"
        >
          <Box className="p-0" dark>
            <Twitch channel="alveussanctuary" />
          </Box>
        </Moveable>
      )}
    </>
  );
};

export default AboutTechPresetsPage;
