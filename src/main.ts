import {
  ActionRow,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Collection,
  GatewayIntentBits,
  GuildMember,
  InteractionResponse,
  Message,
  MessageActionRowComponent,
  MessageComponent,
  Options,
  Role,
} from "discord.js";
import AsyncLock from "async-lock";
import equals from "fast-deep-equal";

import dotenv from "dotenv";
import { LiveCache } from "./cache";
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.MessageContent, GatewayIntentBits.Guilds],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,

    AutoModerationRuleManager: 0,
    ApplicationCommandManager: 0,
    BaseGuildEmojiManager: 0,
    DMMessageManager: 0,
    GuildEmojiManager: 0,
    GuildMemberManager: 0,
    GuildBanManager: 0,
    GuildForumThreadManager: 0,
    GuildInviteManager: 0,
    GuildMessageManager: 0,
    GuildScheduledEventManager: 0,
    GuildStickerManager: 0,
    GuildTextThreadManager: 0,
    MessageManager: 0,
    PresenceManager: 0,
    ReactionManager: 0,
    ReactionUserManager: 0,
    StageInstanceManager: 0,
    ThreadManager: 0,
    ThreadMemberManager: 0,
    UserManager: 0,
    VoiceStateManager: 0,
  }),
});

type RoleButton = {
  emoji: string;
  roleId: string;
};

type ReactConfig = {
  channel: string;
  message: string;
  reactMap: Record<string, string>;
};

const userCache = new LiveCache<Set<string>>();

const guildRoleFetch = new Map<string, Promise<Collection<string, Role>>>();

function updateRolesForGuild(guild: string) {
  guildRoleFetch.set(
    guild,
    client.guilds.fetch(guild).then((g) => g.roles.fetch())
  );
}

function getGuildRoles(guild: string) {
  if (!guildRoleFetch.has(guild)) {
    updateRolesForGuild(guild);
  }
  return guildRoleFetch.get(guild)!;
}

const reactConfig: ReactConfig[] = [
  {
    channel: "1146312406033764452",
    message: "1150315956560728155",
    reactMap: {
      "🎃": "710829108715585566",
      "🎦": "710829185576206366",
      "🐺": "710827836033859654",
      "🔪": "784657976593612831",
      "🎵": "784660928859471892",
      "🌉": "813762120826617866",
      "✊": "820204861245095998",
      "⛏️": "820204949307785236",
      "📝": "820205043747389440",
      "🏹": "820204970783014922",
      "🏎️": "820204912251633685",
      "🎮": "821021864855076916",
      "🧂": "825277377860206622",
      "🔫": "825276637095526400",
      "🚮": "825276668570370069",
      "📇": "837292714046390312",
      "🌎": "831786778998210590",
    },
  },
];

type ButtonInteraction =
  | {
      kind: "change-roles";
    }
  | {
      kind: "set-role";
      originalMsg: string;
      add: boolean;
      roleId: string;
    };

async function prepareMessage(config: ReactConfig) {
  const channel = await client.channels.fetch(config.channel);
  if (!channel) {
    console.log("Channel not found");
    return;
  }

  if (!channel.isTextBased()) {
    console.log("Channel is not text based");
    return;
  }

  if (channel.isDMBased()) {
    console.log("No guild");
    return;
  }

  updateRolesForGuild(channel.guildId!);

  const msg = await channel.messages.fetch(config.message);

  const interactionData: ButtonInteraction = {
    kind: "change-roles",
  };

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Change Roles")
      .setCustomId(JSON.stringify(interactionData))
      .setStyle(ButtonStyle.Primary)
  );

  const roleText = Object.entries(config.reactMap)
    .map(([emoji, roleId]) => `${emoji}: <@&${roleId}>`)
    .join("\n");

  msg.edit({
    content: roleText,
    components: [row] as any,
  });
}

client.on("ready", async () => {
  console.log("Preparing...");

  await Promise.all(reactConfig.map(prepareMessage));

  console.log("Ready!");
});

function buildActionRowForMember(
  messageId: string,
  memberRoles: Set<string>,
  allRoles: Collection<string, Role>
) {
  const rows: ActionRowBuilder[] = [];

  let row = new ActionRowBuilder();

  const config = reactConfig.find((c) => c.message === messageId);

  if (!config) {
    return [];
  }

  for (const [emoji, roleId] of Object.entries(config.reactMap)) {
    if (!memberRoles.has(roleId)) {
      const data: ButtonInteraction = {
        kind: "set-role",
        originalMsg: messageId,
        add: true,
        roleId: roleId,
      };
      const button = new ButtonBuilder()
        .setLabel(allRoles.get(roleId)?.name ?? "")
        .setEmoji(emoji)
        .setCustomId(JSON.stringify(data))
        .setStyle(ButtonStyle.Secondary);
      row.addComponents(button);
    } else {
      const data: ButtonInteraction = {
        kind: "set-role",
        originalMsg: messageId,
        add: false,
        roleId: roleId,
      };
      const button = new ButtonBuilder()
        .setLabel(allRoles.get(roleId)?.name ?? "")
        .setEmoji(emoji)
        .setCustomId(JSON.stringify(data))
        .setStyle(ButtonStyle.Primary);
      row.addComponents(button);
    }
    if (row.components.length === 5) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
  }

  if (row.components.length > 0) {
    rows.push(row);
  }

  return rows;
}

function exists<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function guessRoleListFromComponents(
  rows: ActionRow<MessageActionRowComponent>[]
) {
  const roles = rows
    .flatMap((row) => row.components)
    .map((component) => {
      if (!component.customId) {
        return null;
      }

      const data: ButtonInteraction = JSON.parse(component.customId);
      if (data.kind === "set-role" && !data.add) {
        return data.roleId;
      } else {
        return null;
      }
    })
    .filter(exists);

  return new Set(roles);
}

function buildMessageForMember(
  messageId: string,
  memberRoles: Set<string>,
  allRoles: Collection<string, Role>
) {
  const rows = buildActionRowForMember(messageId, memberRoles, allRoles);

  return {
    content: "Click the buttons below to get your roles!",
    components: rows as any,
  };
}

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isButton()) {
      return;
    }

    const interactionData: ButtonInteraction = JSON.parse(interaction.customId);

    if (!interaction.guild) {
      console.log("No guild");
      return;
    }

    const guild = interaction.guild;

    switch (interactionData.kind) {
      case "change-roles": {
        updateRolesForGuild(guild.id);

        const member = await interaction.guild.members.fetch(
          interaction.user.id
        );

        if (!member) {
          console.log("No member");
          return;
        }

        const memberRoleIds = new Set(
          member.roles.cache.map((role) => role.id)
        );

        interaction.reply({
          ...buildMessageForMember(
            interaction.message.id,
            memberRoleIds,
            await getGuildRoles(guild.id)
          ),
          ephemeral: true,
        });
        break;
      }
      case "set-role": {
        const intMessagePromise = interaction.deferUpdate();

        const updateRoles = async () => {
          const member = await guild.members.fetch(interaction.user.id);

          if (!member) {
            console.log("No member");
            return;
          }

          if (interactionData.add) {
            await member.roles.add(interactionData.roleId);
          } else {
            await member.roles.remove(interactionData.roleId);
          }
        };

        const updateRolesPromise = updateRoles();

        await userCache.run(
          interaction.user.id,
          (current) => {
            if (!current) {
              current = guessRoleListFromComponents(
                interaction.message.components
              );
            } else {
              current = new Set(current);
            }

            if (interactionData.add) {
              current.add(interactionData.roleId);
            } else {
              current.delete(interactionData.roleId);
            }

            return current;
          },
          async (current) => {
            const intMessage = await intMessagePromise;

            const guessedMessageDetails = buildMessageForMember(
              interactionData.originalMsg,
              current,
              await getGuildRoles(guild.id)
            );
            const updatePromise = intMessage.edit({
              ...guessedMessageDetails,
            });

            await updatePromise;
          },
          async () => {
            const intMessage = await intMessagePromise;
            await updateRolesPromise;

            const member = await guild.members.fetch(interaction.user.id);

            if (!member) {
              console.log("No member");
              return;
            }

            const roles = new Set(member.roles.cache.map((role) => role.id));

            const details = buildMessageForMember(
              interactionData.originalMsg,
              roles,
              await getGuildRoles(guild.id)
            );

            await intMessage.edit({
              ...details,
            });
          }
        );

        break;
      }
    }
  } catch (e) {
    console.error(e);
  }
});

client.login(process.env.TOKEN);
