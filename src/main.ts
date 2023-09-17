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

import dotenv from "dotenv";
import { LiveCache } from "./cache";
import z from "zod";
import { ReactConfig, readConfig } from "./config";
dotenv.config();

const reactConfig = await readConfig();

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

// Live cache for fixing race conditions
const userCache = new LiveCache<Set<string>>();

// Cache for roles (for role names)
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

// For customIds on buttons
const buttonInteraction = z.union([
  z.object({
    kind: z.literal("change-roles"),
  }),
  z.object({
    kind: z.literal("set-role"),
    originalMsg: z.string(),
    add: z.boolean(),
    roleId: z.string(),
  }),
]);

type ButtonInteraction = z.infer<typeof buttonInteraction>;

// Prepare a message on startup
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

function safeJsonParse<T>(str: string): T | null {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isButton()) {
      return;
    }

    const interactionDataMaybe = buttonInteraction.safeParse(
      safeJsonParse(interaction.customId)
    );

    if (!interactionDataMaybe.success) {
      return;
    }

    const interactionData = interactionDataMaybe.data;

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

        // This multi-stage process is used to make the buttons feel responsive while
        // queueing multiple stages and avoiding race conditions
        await userCache.run(
          interaction.user.id,
          (current) => {
            // First, we infer the user's current roles from the message's button colors
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
            // Next, we edit the message with the updated inferred roles
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
            // Finally, we reconcile the user's actual roles and edit the message again with the real roles
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
