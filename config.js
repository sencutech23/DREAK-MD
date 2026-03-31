import dotenv from 'dotenv';
import moment from 'moment-timezone';

dotenv.config();

export const config = {
    owner: process.env.OWNER_NUMBER || '237XXXXXXXXX',
    botName: process.env.BOT_NAME || 'DREAK-MD',
    prefix: process.env.PREFIX || '/',
    mode: process.env.MODE || 'public',
    timeZone: 'Africa/Douala',
    sessionId: process.env.SESSION_ID || 'dreak_session',
    
    // Couleurs pour les logs
    colors: {
        reset: '\x1b[0m',
        bright: '\x1b[1m',
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m'
    },
    
    // Messages par défaut
    messages: {
        notAdmin: '❌ Désolé, cette commande est réservée aux admins du groupe !',
        notOwner: '❌ Cette commande est réservée au propriétaire du bot !',
        notGroup: '❌ Cette commande ne peut être utilisée que dans les groupes !',
        error: '❌ Une erreur est survenue, réessaie plus tard.',
        wait: '⏳ Traitement en cours...'
    }
};

export const getTime = () => {
    return moment().tz(config.timeZone).format('HH:mm:ss');
};
