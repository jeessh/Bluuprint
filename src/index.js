import { Client, Events, GatewayIntentBits, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle, RoleSelectMenuBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { CREATE_ACTION_ITEMS } from './commands.js';

dotenv.config();

// Inline capture requires GuildMessages + MessageContent intents
const client = new Client({ intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
] });
client.commands = new Collection();
client.commands.set(CREATE_ACTION_ITEMS.name, CREATE_ACTION_ITEMS);

// Per-user builder state
// { items: [{ t: string, r: string[] }], selRoles: string[], awaiting: boolean, builderMessageId?: string, channelId?: string }
const userActionItems = new Map();

client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand() && interaction.commandName === 'create_action_items') {
            await startActionItemProcess(interaction);
            return;
        }

        if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
            return;
        }

        if (interaction.isRoleSelectMenu() && interaction.customId === 'select_roles_current') {
            await handleRoleSelect(interaction);
            return;
        }
    } catch (err) {
        console.error('Interaction error:', err);
    }
});

async function startActionItemProcess(interaction) {
    const userId = interaction.user.id;
    const initial = { items: [], selRoles: [], awaiting: false };
    userActionItems.set(userId, initial);

    await interaction.reply({
        content: renderBuilder(initial),
        components: buildComponents(initial),
    });

    const msg = await interaction.fetchReply();
    const state = userActionItems.get(userId) || initial;
    state.builderMessageId = msg.id;
    state.channelId = msg.channelId;
    userActionItems.set(userId, state);
}

async function handleButtonInteraction(interaction) {
    const userId = interaction.user.id;
    const state = userActionItems.get(userId) || { items: [], selRoles: [], awaiting: false };

    if (interaction.customId === 'add_item') {
        state.awaiting = true;
        userActionItems.set(userId, state);
        await interaction.update({
            content: renderBuilder(state, '📝 Type your next action item in chat and send it. I\'ll capture it with the selected roles.'),
            components: buildComponents(state),
            allowedMentions: { parse: [] },
        });
        return;
    }

    if (interaction.customId === 'stop_capture') {
        state.awaiting = false;
        userActionItems.set(userId, state);
        await interaction.update({
            content: renderBuilder(state, '✋ Stopped capturing messages. Click Add Action Item to start again.'),
            components: buildComponents(state),
            allowedMentions: { parse: [] },
        });
        return;
    }

    if (interaction.customId === 'finish_list') {
        await finishActionItems(interaction, userId);
        return;
    }
}

async function handleRoleSelect(interaction) {
    const userId = interaction.user.id;
    const state = userActionItems.get(userId) || { items: [], selRoles: [], awaiting: false };
    state.selRoles = interaction.values;
    userActionItems.set(userId, state);
    await interaction.update({
        content: renderBuilder(state, `Selected ${interaction.values.length} role(s) for next item`),
        components: buildComponents(state),
        allowedMentions: { parse: [] },
    });
}

async function finishActionItems(interaction, userId) {
    const state = userActionItems.get(userId) || { items: [] };
    const items = state.items || [];

    if (items.length === 0) {
        await interaction.update({
            content: '📝 No action items were added. Use `/create_action_items` to start again.',
            components: [],
        });
        userActionItems.delete(userId);
        return;
    }

    const itemsList = items.map((item, index) => {
        const roles = (item.r || []).map(id => `<@&${id}>`).join(' ');
        return `${index + 1}. ${item.t}${roles ? ` — notify: ${roles}` : ''}`;
    }).join('\n');

    await interaction.update({
        content: `📋 **Meeting Action Items** (${items.length} total)\n\n${itemsList}\n\n✅ All done! Use \`/create_action_items\` to create a new list.`,
        components: [],
    });

    userActionItems.delete(userId);
}

// Build components for the builder message
function buildComponents(state) {
    const rows = [];
    // Row 1: Role select for next item
    rows.push(new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
            .setCustomId('select_roles_current')
            .setPlaceholder('Pick roles for next item (optional)')
            .setMinValues(0)
            .setMaxValues(25)
    ));
    // Row 2: Add/Stop/Finish buttons
    const buttons = [
        new ButtonBuilder().setCustomId('add_item').setLabel('Add Action Item').setStyle(ButtonStyle.Primary).setEmoji('➕').setDisabled(!!state.awaiting),
        new ButtonBuilder().setCustomId('finish_list').setLabel('Finish List').setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(!(state.items && state.items.length)),
    ];
    if (state.awaiting) {
        buttons.splice(1, 0, new ButtonBuilder().setCustomId('stop_capture').setLabel('Stop Typing').setStyle(ButtonStyle.Danger).setEmoji('✋'));
    }
    rows.push(new ActionRowBuilder().addComponents(...buttons));
    return rows;
}

function renderBuilder(state, notice) {
    const count = state.items.length;
    const parts = [];
    if (notice) parts.push(notice);
    parts.push(`🗒️ **Action Item Creator** (${count} ${count === 1 ? 'item' : 'items'})`);
    parts.push('Pick roles for the next item, click Add, then type your action item in chat.');
    parts.push('');
    if (count > 0) {
        parts.push(...state.items.map((it, i) => `• ${i + 1}. ${it.t}${(it.r?.length ? ` (roles: ${it.r.length})` : '')}`));
        parts.push('');
    }
    const selCount = (state.selRoles || []).length;
    parts.push(`Next item roles: ${selCount} selected`);
    if (state.awaiting) parts.push('Listening for your next message…');
    parts.push('');
    return parts.join('\n');
}

// Capture inline messages when awaiting input
client.on(Events.MessageCreate, async (message) => {
    try {
        if (message.author.bot) return;
        const userId = message.author.id;
        const state = userActionItems.get(userId);
        if (!state || !state.awaiting) return;
        if (state.channelId && message.channelId !== state.channelId) return;
        const desc = message.content?.trim();
        if (!desc || desc.startsWith('/')) return; // ignore commands/empties

        const roles = Array.isArray(state.selRoles) ? state.selRoles : [];
        state.items.push({ t: desc, r: roles });
        // Keep awaiting true so they can continue typing
        userActionItems.set(userId, state);

        // Try deleting the user's message to keep the channel tidy (ignore failures)
        try { await message.delete(); } catch (e) { /* ignore delete failures */ }

        // Send a separate message that pings roles once
        if (roles.length) {
            const mentions = roles.map(id => `<@&${id}>`).join(' ');
            await message.channel.send({
                content: `✅ Added: ${desc} — notify: ${mentions}`,
                allowedMentions: { roles },
            });
        } else {
            await message.channel.send({ content: `✅ Added: ${desc}` });
        }

        // Update the builder message
        if (state.builderMessageId) {
            try {
                const builderMsg = await message.channel.messages.fetch(state.builderMessageId);
                await builderMsg.edit({
                    content: renderBuilder(state, `✅ Added: "${desc}"${roles.length ? ` (roles: ${roles.length})` : ''}`),
                    components: buildComponents(state),
                    allowedMentions: { parse: [] },
                });
            } catch (e) { /* ignore edit failures */ }
        }
    } catch (err) {
        console.error('Inline capture error:', err);
    }
});

client.login(process.env.DISCORD_TOKEN);