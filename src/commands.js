export const HELLO = {
    name: 'hello',
    description: 'Says hello and echoes your message',
    options: [{
        name: 'message',
        type: 3, // STRING type
        description: 'The message you want to echo back',
        required: true
    }]
};

export const CREATE_ACTION_ITEMS = {
    name: 'create_action_items',
    description: 'Create action items for the meeting'
};