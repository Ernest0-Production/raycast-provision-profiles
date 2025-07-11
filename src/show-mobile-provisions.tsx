import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { ProvisioningProfile } from "./types";
import { parseProvisioningProfile } from "./utils/parser";
import { useState } from "react";
import { DeviceList } from "./components/DeviceList";
import { getProfileTypeColor } from "./utils/helpers";

const PROFILES_PATH = path.join(os.homedir(), "Library/MobileDevice/Provisioning Profiles");

async function getProvisioningProfiles(): Promise<ProvisioningProfile[]> {
  try {
    const files = await fs.readdir(PROFILES_PATH);

    const filesWithStats = await Promise.all(
      files
        .filter((file) => file.endsWith(".mobileprovision"))
        .map(async (file) => {
          const filePath = path.join(PROFILES_PATH, file);
          const stat = await fs.stat(filePath);
          return { file, mtime: stat.mtime };
        }),
    );

    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    const profilePromises = filesWithStats.map(async ({ file }) => {
      try {
        return await parseProvisioningProfile(path.join(PROFILES_PATH, file));
      } catch (error) {
        console.error(`Failed to parse ${file}:`, error);
        return null;
      }
    });
    const results = await Promise.all(profilePromises);
    return results.filter((p): p is ProvisioningProfile => p !== null);
  } catch (error) {
    console.error("Failed to read provisioning profiles directory:", error);
    return [];
  }
}

function ProfileListItem({
  profile,
  isShowingDetail,
  onToggleDetails,
}: {
  profile: ProvisioningProfile;
  isShowingDetail: boolean;
  onToggleDetails: () => void;
}) {
  const accessories: List.Item.Accessory[] = isShowingDetail
    ? []
    : [
        { tag: { value: profile.Platform.join(", "), color: Color.SecondaryText } },
        { tag: { value: profile.Type, color: getProfileTypeColor(profile.Type) } },
        ...(profile.ExpirationDate < new Date() ? [{ tag: { value: "Expired", color: Color.Red } }] : []),
      ];

  const hasDevices = profile.ProvisionedDevices && profile.ProvisionedDevices.length > 0;
  const keywords = [
    ...(profile.ProvisionedDevices ?? []),
    profile.TeamName,
    profile.Type,
    ...profile.Platform,
    profile.AppIDName,
    profile.ApplicationIdentifierPrefix[0],
    profile.UUID,
  ];

  return (
    <List.Item
      key={profile.UUID}
      title={profile.Name}
      subtitle={profile.TeamName}
      accessories={accessories}
      keywords={keywords}
      quickLook={{ path: profile.filePath }}
      detail={
        <List.Item.Detail
          markdown={[
            "## Entitlements",
            "",
            "```json",
            JSON.stringify(profile.Entitlements, null, 2),
            "```",
            "",
            "## Certificates",
            "",
            profile.DeveloperCertificates.map(
              (cert) => `- **${cert.subject.commonName}** (Expires: ${cert.validity.notAfter.toLocaleDateString()})`,
            ).join("\n"),
          ].join("\n")}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label title="UUID" text={profile.UUID} />
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label title="App ID Name" text={profile.AppIDName} />
              {profile.Entitlements["application-identifier"] && (
                <List.Item.Detail.Metadata.Label
                  title="App Identifier"
                  text={profile.Entitlements["application-identifier"]?.split(".").slice(1).join(".")}
                />
              )}
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label title="Team Name" text={profile.TeamName} />
              <List.Item.Detail.Metadata.Label title="Team Identifier" text={profile.TeamIdentifier[0]} />
              {hasDevices && (
                <>
                  <List.Item.Detail.Metadata.Separator />
                  <List.Item.Detail.Metadata.Label
                    title="Devices"
                    text={profile.ProvisionedDevices?.length.toString()}
                  />
                </>
              )}

              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label title="Creation Date" text={profile.CreationDate.toLocaleString()} />
              <List.Item.Detail.Metadata.Label title="Expiration Date" text={profile.ExpirationDate.toLocaleString()} />
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          <Action
            title={isShowingDetail ? "Hide Details" : "Show Details"}
            icon={Icon.AppWindowSidebarLeft}
            onAction={onToggleDetails}
          />
          {hasDevices && (
            <Action.Push
              title="Show Devices"
              icon={Icon.List}
              target={<DeviceList deviceIds={profile.ProvisionedDevices!} />}
            />
          )}
          <ActionPanel.Section>
            <Action.ShowInFinder path={profile.filePath} shortcut={{ modifiers: ["cmd"], key: "o" }} />
            <Action.ToggleQuickLook title="Quick Look" shortcut={{ modifiers: ["cmd"], key: "y" }} />
            <Action.CopyToClipboard
              title="Copy Path"
              content={profile.filePath}
              shortcut={{ modifiers: ["cmd", "shift"], key: "," }}
            />
            <Action.CopyToClipboard title="Copy Uuid" content={profile.UUID} />
            <Action.CopyToClipboard title="Copy Team ID" content={profile.TeamIdentifier[0]} />
            {profile.Entitlements["application-identifier"] && (
              <Action.CopyToClipboard
                title="Copy Application Identifier"
                content={profile.Entitlements["application-identifier"]}
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

export default function ShowMobileProvisions() {
  const { data: profiles, isLoading } = usePromise(getProvisioningProfiles, []);
  const [isShowingDetail, setIsShowingDetail] = useState(false);

  return (
    <List isLoading={isLoading} isShowingDetail={isShowingDetail}>
      {profiles?.map((profile) => (
        <ProfileListItem
          key={profile.UUID}
          profile={profile}
          isShowingDetail={isShowingDetail}
          onToggleDetails={() => setIsShowingDetail((v) => !v)}
        />
      ))}
    </List>
  );
}
