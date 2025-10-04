import { Client, Events, GatewayIntentBits, Collection } from 'discord.js';
import dotenv from 'dotenv';
import { CREATE_ACTION_ITEMS } from './commands.js';

dotenv.config();

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Create a collection to store commands
client.commands = new Collection();

// Add commands to the collection
client.commands.set(CREATE_ACTION_ITEMS.name, CREATE_ACTION_ITEMS);

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

// Listen for slash command interactions
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'create_action_items') {
        await interaction.reply('Creating action items for the meeting...');
    }
});

// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);