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

const userCache = new LiveCache<Set<string>>();

const guildRoleFetch = new Map<string, Promise<Collection<string, Role>>>();

function updateRolesForGuild(guild: string) {
  guildRoleFetch.set(
    guild,
    client.guilds.fetch(guild).then((g) => g.roles.fetch()),
  );
}

function getGuildRoles(guild: string) {
  if (!guildRoleFetch.has(guild)) {
    updateRolesForGuild(guild);
  }
  return guildRoleFetch.get(guild)!;
}

// [
//   {
//     "channel": "784465202077892658",
//     "message": "784466461279125514",
//     "reactMap": {
//       "🎃": "710829108715585566",
//       "🎦": "710829185576206366",
//       "🐺": "710827836033859654",
//       "🔪": "784657976593612831",
//       "🎵": "784660928859471892",
//       "🌉": "813762120826617866",
//       "✊": "820204861245095998",
//       "⛏️": "820204949307785236",
//       "📝": "820205043747389440",
//       "🏹": "820204970783014922",
//       "🏎️": "820204912251633685",
//       "🎮": "821021864855076916",
//       "🧂": "825277377860206622",
//       "🔫": "825276637095526400",
//       "🚮": "825276668570370069",
//       "📇": "837292714046390312",
//       "🌎": "831786778998210590"
//     }
//   },
// ]

const roleButtons: RoleButton[] = [
  {
    emoji: "🎃",
    roleId: "710829108715585566",
  },
  {
    emoji: "🎦",
    roleId: "710829185576206366",
  },
  {
    emoji: "🐺",
    roleId: "710827836033859654",
  },
  {
    emoji: "🔪",
    roleId: "784657976593612831",
  },
  {
    emoji: "🎵",
    roleId: "784660928859471892",
  },
  {
    emoji: "🌉",
    roleId: "813762120826617866",
  },
  {
    emoji: "✊",
    roleId: "820204861245095998",
  },
  {
    emoji: "⛏️",
    roleId: "820204949307785236",
  },
];

const channelId = "1146312406033764452";
const msgId = "1150315956560728155";

type ButtonInteraction =
  | {
      kind: "change-roles";
    }
  | {
      kind: "set-role";
      add: boolean;
      roleId: string;
    };

client.on("ready", async () => {
  console.log("Ready!");

  const channel = await client.channels.fetch(channelId);
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

  const msg = await channel.messages.fetch(msgId);

  const interactionData: ButtonInteraction = {
    kind: "change-roles",
  };

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Change Roles")
      .setCustomId(JSON.stringify(interactionData))
      .setStyle(ButtonStyle.Primary),
  );

  const roleText = roleButtons
    .map((role) => `${role.emoji}: <@&${role.roleId}>`)
    .join("\n");

  msg.edit({
    content: roleText,
    components: [row] as any,
  });
});

function buildActionRowForMember(
  memberRoles: Set<string>,
  allRoles: Collection<string, Role>,
) {
  const rows: ActionRowBuilder[] = [];

  let row = new ActionRowBuilder();

  for (const roleButton of roleButtons) {
    if (!memberRoles.has(roleButton.roleId)) {
      const data: ButtonInteraction = {
        kind: "set-role",
        add: true,
        roleId: roleButton.roleId,
      };
      const button = new ButtonBuilder()
        .setLabel(allRoles.get(roleButton.roleId)?.name ?? "")
        .setEmoji(roleButton.emoji)
        .setCustomId(JSON.stringify(data))
        .setStyle(ButtonStyle.Secondary);
      row.addComponents(button);
    } else {
      const data: ButtonInteraction = {
        kind: "set-role",
        add: false,
        roleId: roleButton.roleId,
      };
      const button = new ButtonBuilder()
        .setLabel(allRoles.get(roleButton.roleId)?.name ?? "")
        .setEmoji(roleButton.emoji)
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
  rows: ActionRow<MessageActionRowComponent>[],
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
  memberRoles: Set<string>,
  allRoles: Collection<string, Role>,
) {
  const rows = buildActionRowForMember(memberRoles, allRoles);

  return {
    content: "Click the buttons below to get your roles!",
    components: rows as any,
  };
}

// Used for cancelling previous interactions if multiple are run in parallel
const userInteractionCounter = new Map<string, number>();

function getNextUserInteractionCounterKey(user: string) {
  const key = userInteractionCounter.get(user);
  const newKey = key ? key + 1 : 1;
  userInteractionCounter.set(user, newKey);

  return newKey;
}

function isUserInteractionCounterKeyValid(user: string, key: number) {
  const currentKey = userInteractionCounter.get(user);
  return currentKey === key;
}

function deleteInteractionCounterKey(user: string) {
  userInteractionCounter.delete(user);
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
          interaction.user.id,
        );

        if (!member) {
          console.log("No member");
          return;
        }

        const memberRoleIds = new Set(
          member.roles.cache.map((role) => role.id),
        );

        interaction.reply({
          ...buildMessageForMember(
            memberRoleIds,
            await getGuildRoles(guild.id),
          ),
          ephemeral: true,
        });
        break;
      }
      case "set-role": {
        let intMessagePromise = interaction.deferUpdate();
        await userCache.run(
          interaction.user.id,
          (current) => {
            if (!current) {
              current = guessRoleListFromComponents(
                interaction.message.components,
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
              current,
              await getGuildRoles(guild.id),
            );
            const updatePromise = intMessage.edit({
              ...guessedMessageDetails,
            });

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

            await updatePromise;
          },
          async () => {
            const intMessage = await intMessagePromise;

            const member = await guild.members.fetch(interaction.user.id);

            if (!member) {
              console.log("No member");
              return;
            }

            const roles = new Set(member.roles.cache.map((role) => role.id));

            const details = buildMessageForMember(
              roles,
              await getGuildRoles(guild.id),
            );

            await intMessage.edit({
              ...details,
            });
          },
        );

        // const guessedMemberRoles = guessRoleListFromComponents(
        //   interaction.message.components
        // );

        // if (interactionData.add) {
        //   guessedMemberRoles.add(interactionData.roleId);
        // } else {
        //   guessedMemberRoles.delete(interactionData.roleId);
        // }

        // const guessedMessageDetails = buildMessageForMember(
        //   guessedMemberRoles,
        //   await getGuildRoles(guild.id)
        // );
        // const m = await interaction.deferUpdate();
        // const key = getNextUserInteractionCounterKey(interaction.user.id);
        // await userLock.acquire(interaction.user.id, async () => {
        //   let interactionUpdatePromise1: Promise<Message<boolean>> | null =
        //     null;
        //   if (isUserInteractionCounterKeyValid(interaction.user.id, key)) {
        //     // Perform an "estimated" update for quicker feedback if no other updates are queued
        //     interactionUpdatePromise1 = m.edit({
        //       ...guessedMessageDetails,
        //     });
        //   }

        //   const member = await guild.members.fetch(interaction.user.id);

        //   if (!member) {
        //     console.log("No member");
        //     return;
        //   }

        //   if (interactionData.add) {
        //     await member.roles.add(interactionData.roleId);
        //   } else {
        //     await member.roles.remove(interactionData.roleId);
        //   }

        //   if (!isUserInteractionCounterKeyValid(interaction.user.id, key)) {
        //     return;
        //   }

        //   await member.fetch(true);

        //   const roles = new Set(member.roles.cache.map((role) => role.id));

        //   const realMessageDetails = buildMessageForMember(
        //     roles,
        //     await getGuildRoles(guild.id)
        //   );

        //   if (!equals(realMessageDetails, guessedMessageDetails)) {
        //     await interactionUpdatePromise1;
        //     await m.edit({
        //       ...realMessageDetails,
        //     });
        //   }
        // });

        break;
      }
    }
  } catch (e) {
    console.error(e);
  }
});

client.login(process.env.DISCORD_TOKEN);

// TODO:
// Create a better cache system for what roles a user has, to be more responsive
// fix above
