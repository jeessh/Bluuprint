import { Client, Events, GatewayIntentBits, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import dotenv from 'dotenv';
import { CREATE_ACTION_ITEMS } from './commands.js';

dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();
client.commands.set(CREATE_ACTION_ITEMS.name, CREATE_ACTION_ITEMS);

// Store action items per user
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
    
    const addButton = new ButtonBuilder()
        .setCustomId('add_item')
        .setLabel('Add Action Item')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➕');
    
    const finishButton = new ButtonBuilder()
        .setCustomId('finish_list')
        .setLabel('Finish List')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅');
    
    const row = new ActionRowBuilder().addComponents(addButton, finishButton);
    
    await interaction.reply({
        content: '🗒️ **Action Item Creator**\nClick "Add Action Item" to add items, or "Finish List" when done.',
        components: [row]
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
    }
}

async function handleModalSubmit(interaction) {
    if (interaction.customId === 'action_item_modal') {
        const userId = interaction.user.id;
        const actionItem = interaction.fields.getTextInputValue('action_item_text');
        
        if (!userActionItems.has(userId)) {
            userActionItems.set(userId, []);
        }
        
        userActionItems.get(userId).push(actionItem);
        const currentCount = userActionItems.get(userId).length;
        
        const addButton = new ButtonBuilder()
            .setCustomId('add_item')
            .setLabel('Add Another Item')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➕');
        
        const finishButton = new ButtonBuilder()
            .setCustomId('finish_list')
            .setLabel('Finish List')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');
        
        const row = new ActionRowBuilder().addComponents(addButton, finishButton);
        
        await interaction.update({
            content: `✅ Added item #${currentCount}: "${actionItem}"\n\n🗒️ **Action Item Creator** (${currentCount} items)\nAdd another item or finish your list.`,
            components: [row]
        });
    }
}

async function finishActionItems(interaction, userId) {
    const items = userActionItems.get(userId) || [];
    
    if (items.length === 0) {
        await interaction.update({
            content: '📝 No action items were added. Use `/create_action_items` to start again.',
            components: []
        });
        userActionItems.delete(userId);
        return;
    }
    
    const itemsList = items.map((item, index) => `${index + 1}. ${item}`).join('\n');
    
    await interaction.update({
        content: `📋 **Meeting Action Items** (${items.length} total)\n\n${itemsList}\n\n✅ All done! Use \`/create_action_items\` to create a new list.`,
        components: []
    });
    
    userActionItems.delete(userId);
}

client.login(process.env.DISCORD_TOKEN);