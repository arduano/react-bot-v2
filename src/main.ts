import {
  ActionRow,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  GatewayIntentBits,
  GuildMember,
  Options,
} from "discord.js";

import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.MessageContent, GatewayIntentBits.Guilds],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
  }),
});

type RoleButton = {
  emoji: string;
  name: string;
  roleId: string;
};

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
    name: "Among Us",
    roleId: "710829108715585566",
  },
  {
    emoji: "🎦",
    name: "Movie Night",
    roleId: "710829185576206366",
  },
  {
    emoji: "🐺",
    name: "Werewolf",
    roleId: "710827836033859654",
  },
  {
    emoji: "🔪",
    name: "Mafia",
    roleId: "784657976593612831",
  },
  {
    emoji: "🎵",
    name: "Music",
    roleId: "784660928859471892",
  },
  {
    emoji: "🌉",
    name: "Cities: Skylines",
    roleId: "813762120826617866",
  },
  {
    emoji: "✊",
    name: "Minecraft",
    roleId: "820204861245095998",
  },
  {
    emoji: "⛏️",
    name: "Terraria",
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

  const msg = await channel.messages.fetch(msgId);

  const interactionData: ButtonInteraction = {
    kind: "change-roles",
  };

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Change Roles")
      .setCustomId(JSON.stringify(interactionData))
      .setStyle(ButtonStyle.Primary)
  );

  msg.edit({
    content: "Click the buttons below to get your roles!",
    components: [row],
  });
});

function buildActionRowForMember(member: GuildMember) {
  const rows: ActionRowBuilder[] = [];

  let row = new ActionRowBuilder();

  for (const roleButton of roleButtons) {
    if (!member.roles.cache.has(roleButton.roleId)) {
      const data: ButtonInteraction = {
        kind: "set-role",
        add: true,
        roleId: roleButton.roleId,
      };
      const button = new ButtonBuilder()
        .setLabel(roleButton.name)
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
        .setLabel(roleButton.name)
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

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) {
    return;
  }

  const interactionData: ButtonInteraction = JSON.parse(interaction.customId);

  if (!interaction.guild) {
    console.log("No guild");
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);

  if (!member) {
    console.log("No member");
    return;
  }

  switch (interactionData.kind) {
    case "change-roles": {
      const rows = buildActionRowForMember(member);
      interaction.reply({
        ephemeral: true,
        content: "Click the buttons below to get your roles!",
        components: rows,
      });
      break;
    }
    case "set-role": {
      const role = await interaction.guild.roles.fetch(interactionData.roleId);

      if (!role) {
        console.log("No role");
        return;
      }

      if (interactionData.add) {
        await member.roles.add(role);
      } else {
        await member.roles.remove(role);
      }

      await member.fetch(true);

      const rows = buildActionRowForMember(member);

      interaction.update({
        content: "Click the buttons below to get your roles!",
        components: rows,
      });
      break;
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
