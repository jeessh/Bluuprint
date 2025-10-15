import { Client, Events, GatewayIntentBits, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, RoleSelectMenuBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { CREATE_ACTION_ITEMS } from './commands.js';

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();
client.commands.set(CREATE_ACTION_ITEMS.name, CREATE_ACTION_ITEMS);

// Store action builder state per user
// state: { items: [{ t, r: string[] }], draft?: { t, r: string[] } }
const userActionItems = new Map();

client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'create_action_items') {
            await startActionItemProcess(interaction);
        }
    } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
        await handleModalSubmit(interaction);
    }
});

async function startActionItemProcess(interaction) {
    const userId = interaction.user.id;
    userActionItems.set(userId, []);
    
    await interaction.reply({
        content: renderBuilder({ items: [] }),
        components: buildComponents({ items: [] })
    });
}

async function handleButtonInteraction(interaction) {
    const userId = interaction.user.id;
    
    if (interaction.customId === 'add_item') {
        const modal = new ModalBuilder()
            .setCustomId('action_item_modal')
            .setTitle('Add Action Item');

        const actionItemInput = new TextInputBuilder()
            .setCustomId('action_item_text')
            .setLabel('What needs to be done?')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('e.g., Follow up with client by Friday')
            .setRequired(true)
            .setMaxLength(500);

        const actionRow = new ActionRowBuilder().addComponents(actionItemInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    } else if (interaction.customId === 'finish_list') {
        await finishActionItems(interaction, userId);
    } else if (interaction.customId === 'confirm_add') {
        const state = userActionItems.get(userId) || { items: [] };
        if (!state.draft) return interaction.deferUpdate();
        state.items.push(state.draft);
        delete state.draft;
        userActionItems.set(userId, state);
        await interaction.update({
            content: renderBuilder(state, `✅ Added: "${state.items[state.items.length-1].t}"`),
            components: buildComponents(state),
            allowedMentions: { parse: [] }
        });
    } else if (interaction.customId === 'cancel_add') {
        const state = userActionItems.get(userId) || { items: [] };
        delete state.draft;
        userActionItems.set(userId, state);
        await interaction.update({
            content: renderBuilder(state, 'Canceled draft.'),
            components: buildComponents(state),
            allowedMentions: { parse: [] }
        });
    }
}

async function handleModalSubmit(interaction) {
    if (interaction.customId === 'action_item_modal') {
        const userId = interaction.user.id;
        const actionItem = interaction.fields.getTextInputValue('action_item_text');
        
        const state = userActionItems.get(userId) || { items: [] };
        state.draft = { t: actionItem, r: [] };
        userActionItems.set(userId, state);

        await interaction.update({
            content: renderBuilder(state, 'Select roles for this item, then Confirm or Cancel.'),
            components: buildComponents(state, { showDraftControls: true }),
            allowedMentions: { parse: [] }
        });
    }
}

async function finishActionItems(interaction, userId) {
    const state = userActionItems.get(userId) || { items: [] };
    const items = state.items || [];
    
    if (items.length === 0) {
        await interaction.update({
            content: '📝 No action items were added. Use `/create_action_items` to start again.',
            components: []
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
        components: []
    });
    
    userActionItems.delete(userId);
}

// Component builders (local)
function buildComponents(state, opts = {}) {
    const rows = [];
    const baseRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('add_item').setLabel('Add Action Item').setStyle(ButtonStyle.Primary).setEmoji('➕'),
        new ButtonBuilder().setCustomId('finish_list').setLabel('Finish List').setStyle(ButtonStyle.Success).setEmoji('✅')
    );
    rows.push(baseRow);
    if (opts.showDraftControls && state.draft) {
        const roleRow = new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder().setCustomId('select_roles_draft').setPlaceholder('Pick roles to notify (optional)').setMinValues(0).setMaxValues(25)
        );
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_add').setLabel('Confirm').setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId('cancel_add').setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('🛑')
        );
        rows.push(roleRow, confirmRow);
    }
    return rows;
}

function renderBuilder(state, notice) {
    const count = state.items.length;
    const parts = [];
    if (notice) parts.push(notice);
    parts.push(`🗒️ **Action Item Creator** (${count} ${count === 1 ? 'item' : 'items'})`);
    parts.push('Add items, optionally assign roles, then finish your list.');
    parts.push('');
    if (count > 0) {
        parts.push(...state.items.map((it, i) => `• ${i + 1}. ${it.t}${(it.r?.length ? ` (roles: ${it.r.length})` : '')}`));
        parts.push('');
    }
    if (state.draft) {
        parts.push(`Draft: ${state.draft.t}${(state.draft.r?.length ? ` (roles: ${state.draft.r.length})` : '')}`);
        parts.push('');
    }
    return parts.join('\n');
}

// Handle role select menu changes
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isRoleSelectMenu()) return;
    const userId = interaction.user.id;
    const state = userActionItems.get(userId) || { items: [] };
    if (!state.draft) return interaction.deferUpdate();
    state.draft.r = interaction.values;
    userActionItems.set(userId, state);
    await interaction.update({
        content: renderBuilder(state, `Selected ${interaction.values.length} role(s) for draft`),
        components: buildComponents(state, { showDraftControls: true }),
        allowedMentions: { parse: [] }
    });
});

client.login(process.env.DISCORD_TOKEN);