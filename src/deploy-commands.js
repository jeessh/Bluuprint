import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { CREATE_ACTION_ITEMS } from './commands.js';

dotenv.config();

const commands = [CREATE_ACTION_ITEMS];
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

try {
    console.log(`Refreshing ${commands.length} commands...`);
    
    const data = await rest.put(
        Routes.applicationCommands(process.env.DISCORD_APP_ID),
        { body: commands }
    );
    
    console.log(`Reloaded ${data.length} commands ✅`);
} catch (error) {
    console.error(error);
}