
---

## 📄 FICHIER 5: `index.js` (Fichier principal)

```javascript
import { default as makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import P from 'pino';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import qrcode from 'qrcode-terminal';
import dotenv from 'dotenv';
import Database from './lib/database.js';
import MenuGenerator from './lib/menu.js';
import logger from './lib/logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============= CONFIGURATION =============
const config = {
    owner: process.env.OWNER_NUMBER || '237676637824',
    botName: process.env.BOT_NAME || 'DREAK-MD',
    prefix: process.env.PREFIX || '/',
    mode: process.env.MODE || 'public',
    timeZone: process.env.TIMEZONE || 'Africa/Douala',
    parrainCode: process.env.PARRAIN_CODE || 'BOTDREAK'
};

// ============= INITIALISATION =============
const db = new Database();
const menuGen = new MenuGenerator(db);
let sock = null;
let isConnecting = false;

// ============= FONCTION PRINCIPALE =============
async function startBot() {
    if (isConnecting) return;
    isConnecting = true;
    
    console.clear();
    logger.info(`🚀 Démarrage de ${config.botName}...`);
    logger.info(`🎁 Code parrainage: ${config.parrainCode}`);
    logger.info(`📱 Numéro owner: +${config.owner}`);
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState('session');
        
        sock = makeWASocket({
            auth: state,
            logger: P({ level: 'silent' }),
            browser: ['DREAK-MD', 'Chrome', '120.0.0.0'],
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000
        });
        
        sock.ev.on('creds.update', saveCreds);
        
        // Gestion de la connexion
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('\n📱 SCANNE CE QR CODE AVEC WHATSAPP 📱\n');
                qrcode.generate(qr, { small: true });
                console.log('\n🔹 1. Ouvre WhatsApp sur ton téléphone');
                console.log('🔹 2. Menu → Appareils connectés');
                console.log('🔹 3. Associer un appareil');
                console.log('🔹 4. Scanne ce QR code\n');
            }
            
            if (connection === 'open') {
                logger.success(`✅ ${config.botName} connecté avec succès !`);
                logger.info(`👑 Propriétaire: +${config.owner}`);
                logger.info(`⚙️ Préfixe: ${config.prefix}`);
                logger.info(`🎁 Code: ${config.parrainCode}`);
                logger.info(`📱 Mode: ${config.mode}\n`);
                isConnecting = false;
            }
            
            if (connection === 'close') {
                const code = lastDisconnect?.error?.output?.statusCode;
                logger.warn(`❌ Connexion perdue (${code})`);
                isConnecting = false;
                
                if (code !== DisconnectReason.loggedOut) {
                    logger.info('🔄 Reconnexion dans 10 secondes...');
                    setTimeout(startBot, 10000);
                } else {
                    logger.info('👋 Session expirée, redémarrage...');
                    setTimeout(startBot, 5000);
                }
            }
        });
        
        // Gestion des messages
        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;
            
            const jid = msg.key.remoteJid;
            const isGroup = jid.includes('@g.us');
            const sender = isGroup ? msg.key.participant : jid;
            const pushName = msg.pushName || 'User';
            const senderNumber = sender.split('@')[0];
            
            let body = '';
            if (msg.message.conversation) body = msg.message.conversation;
            else if (msg.message.extendedTextMessage) body = msg.message.extendedTextMessage.text;
            
            if (body && body.startsWith(config.prefix)) {
                const args = body.slice(config.prefix.length).trim().split(/\s+/);
                const command = args.shift().toLowerCase();
                
                const isOwner = senderNumber === config.owner;
                const isAdmin = isOwner ? true : await checkAdmin(sock, jid, sender);
                
                // ============= COMMANDES =============
                
                // MENU
                if (command === 'menu' || command === 'help') {
                    const user = db.getUser(senderNumber);
                    const menu = menuGen.generateMenu(jid, pushName, user, isGroup);
                    await sock.sendMessage(jid, { text: menu });
                }
                
                // PARRAINAGE - Voir son code
                else if (command === 'parrain' || command === 'code') {
                    let user = db.getUser(senderNumber);
                    if (!user.code) user.code = db.generateCode(senderNumber);
                    
                    const msgParrain = `
╔══════════════════════════════╗
║   🎁 VOTRE CODE PARRAINAGE
╚══════════════════════════════╝

✨ *${user.code}* ✨

📝 Partage ce code avec tes amis !
🎯 +10 points par parrainage

💡 Commande: ${config.prefix}parrainer [code]
`;
                    await sock.sendMessage(jid, { text: msgParrain });
                }
                
                // PARRAINAGE - Utiliser un code
                else if (command === 'parrainer') {
                    const code = args[0];
                    if (!code) {
                        return await sock.sendMessage(jid, { 
                            text: `❌ Utilisation: ${config.prefix}parrainer [code]\n\nExemple: ${config.prefix}parrainer ${config.parrainCode}` 
                        });
                    }
                    
                    const user = db.getUser(senderNumber);
                    if (user.parrain) {
                        return await sock.sendMessage(jid, { text: '❌ Tu as déjà un parrain !' });
                    }
                    
                    let parrainId = null;
                    if (code === config.parrainCode) {
                        parrainId = config.owner;
                    } else {
                        parrainId = db.verifyCode(code);
                    }
                    
                    if (!parrainId || parrainId === senderNumber) {
                        return await sock.sendMessage(jid, { text: '❌ Code invalide !' });
                    }
                    
                    if (db.addParrainage(senderNumber, parrainId)) {
                        await sock.sendMessage(jid, { 
                            text: `✅ *Parrainage réussi !*\n\n🎉 +10 points ajoutés !\n💡 Utilise ${config.prefix}parrain pour ton code personnel` 
                        });
                        
                        // Notifier le parrain
                        if (parrainId !== config.owner) {
                            try {
                                await sock.sendMessage(`${parrainId}@s.whatsapp.net`, {
                                    text: `🎉 *Nouveau parrainage !*\n\n👤 ${pushName} a utilisé ton code !\n👥 Total: ${db.getUser(parrainId).parrainCount} parrainages`
                                });
                            } catch(e) {}
                        }
                    }
                }
                
                // CLASSEMENT
                else if (command === 'classement' || command === 'top') {
                    const top = db.getTopParrains(10);
                    let msg = `🏆 *TOP 10 PARRAINS* 🏆\n\n`;
                    
                    if (top.length === 0) {
                        msg += "📭 Aucun parrainage pour le moment.\nSois le premier !";
                    } else {
                        top.forEach((u, i) => {
                            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '📌';
                            msg += `${medal} *${i+1}.* \`${u.id}\`\n`;
                            msg += `   👥 ${u.parrainCount} parrainages | ⭐ ${u.points} points\n\n`;
                        });
                    }
                    
                    await sock.sendMessage(jid, { text: msg });
                }
                
                // STATISTIQUES
                else if (command === 'stats' || command === 'mystats') {
                    const user = db.getUser(senderNumber);
                    const parrainages = db.getParrainages(senderNumber);
                    
                    const msg = `
📊 *STATISTIQUES DE ${pushName}*

👤 ID: ${senderNumber}
⭐ Points: ${user.points}
👥 Parrainages: ${user.parrainCount}
🎫 Code: ${user.code || 'Non généré'}
👥 Filleuls: ${parrainages.length}

💡 Utilise ${config.prefix}parrain pour ton code !
`;
                    await sock.sendMessage(jid, { text: msg });
                }
                
                // PING
                else if (command === 'ping') {
                    const start = Date.now();
                    await sock.sendMessage(jid, { text: '🏓 Calcul du ping...' });
                    const ping = Date.now() - start;
                    await sock.sendMessage(jid, { text: `🏓 Pong ! ${ping}ms` });
                }
                
                // BOT INFO
                else if (command === 'botinfo') {
                    const uptime = process.uptime();
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);
                    
                    const msg = `
🤖 *${config.botName}* - Informations

📊 *Statistiques*:
├ ⏱️ Uptime: ${hours}h ${minutes}m ${seconds}s
├ 👑 Owner: +${config.owner}
├ ⚙️ Mode: ${config.mode}
├ 📱 Préfixe: ${config.prefix}
└ 💾 RAM: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB

🎁 Code officiel: ${config.parrainCode}
`;
                    await sock.sendMessage(jid, { text: msg });
                }
                
                // ADMIN - Tag all
                else if (command === 'tagall' && isAdmin && isGroup) {
                    const metadata = await sock.groupMetadata(jid);
                    const participants = metadata.participants;
                    let mentions = [];
                    let message = '📢 *Mention générale*:\n\n';
                    
                    participants.forEach(p => {
                        mentions.push(p.id);
                        message += `@${p.id.split('@')[0]}\n`;
                    });
                    
                    await sock.sendMessage(jid, { text: message, mentions });
                }
                
                // ADMIN - Promote
                else if (command === 'promote' && isAdmin && isGroup) {
                    const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (!mentioned) {
                        return await sock.sendMessage(jid, { text: '❌ Mentionne un utilisateur' });
                    }
                    await sock.groupParticipantsUpdate(jid, [mentioned], 'promote');
                    await sock.sendMessage(jid, { text: `✅ @${mentioned.split('@')[0]} promu admin !`, mentions: [mentioned] });
                }
                
                // ADMIN - Demote
                else if (command === 'demote' && isAdmin && isGroup) {
                    const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (!mentioned) {
                        return await sock.sendMessage(jid, { text: '❌ Mentionne un utilisateur' });
                    }
                    await sock.groupParticipantsUpdate(jid, [mentioned], 'demote');
                    await sock.sendMessage(jid, { text: `✅ @${mentioned.split('@')[0]} rétrogradé !`, mentions: [mentioned] });
                }
                
                // ADMIN - Kick
                else if (command === 'kick' && isAdmin && isGroup) {
                    const mentioned = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                    if (!mentioned) {
                        return await sock.sendMessage(jid, { text: '❌ Mentionne un utilisateur' });
                    }
                    await sock.groupParticipantsUpdate(jid, [mentioned], 'remove');
                    await sock.sendMessage(jid, { text: `✅ @${mentioned.split('@')[0]} expulsé !`, mentions: [mentioned] });
                }
                
                // FUN - Mindset
                else if (command === 'mindset') {
                    const mindsets = [
                        "💪 Je suis fort et capable de tout accomplir !",
                        "🌟 Chaque jour est une nouvelle opportunité.",
                        "🔥 La discipline bat la motivation.",
                        "🎯 Fixe tes objectifs et ne lâche rien !",
                        "⚡ Les échecs sont des leçons."
                    ];
                    const random = mindsets[Math.floor(Math.random() * mindsets.length)];
                    await sock.sendMessage(jid, { text: `🧠 *Mindset*:\n\n${random}` });
                }
                
                // FUN - Motivation
                else if (command === 'motivation') {
                    const quotes = [
                        "🚀 Le succès, c'est tomber 7 fois et se relever 8 fois.",
                        "💫 Ne rêve pas ta vie, vis tes rêves.",
                        "⭐ La seule limite est celle que tu te fixes.",
                        "🏆 Chaque expert a été un débutant."
                    ];
                    const random = quotes[Math.floor(Math.random() * quotes.length)];
                    await sock.sendMessage(jid, { text: `💪 *Motivation*:\n\n${random}` });
                }
                
                // MEDIA - Sticker
                else if (command === 'sticker' || command === 's') {
                    const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quoted || (!quoted.imageMessage && !quoted.videoMessage)) {
                        return await sock.sendMessage(jid, { text: '❌ Réponds à une image/vidéo' });
                    }
                    
                    await sock.sendMessage(jid, { text: '⏳ Conversion...' });
                    
                    let media;
                    if (quoted.imageMessage) {
                        media = await sock.downloadMediaMessage({ message: { imageMessage: quoted.imageMessage } });
                    } else {
                        media = await sock.downloadMediaMessage({ message: { videoMessage: quoted.videoMessage } });
                    }
                    
                    await sock.sendMessage(jid, { sticker: media, mimetype: 'image/webp' });
                }
                
                // Commande inconnue
                else {
                    await sock.sendMessage(jid, { text: `❌ Commande inconnue. Tape ${config.prefix}menu` });
                }
            }
        });
        
    } catch (err) {
        logger.error(`❌ Erreur: ${err.message}`);
        isConnecting = false;
        setTimeout(startBot, 10000);
    }
}

// ============= FONCTION POUR VÉRIFIER ADMIN =============
async function checkAdmin(sock, groupJid, userJid) {
    try {
        const metadata = await sock.groupMetadata(groupJid);
        const participant = metadata.participants.find(p => p.id === userJid);
        return participant?.admin === 'admin' || participant?.admin === 'superadmin';
    } catch {
        return false;
    }
}

// ============= GESTION DES ERREURS =============
process.on('uncaughtException', (err) => {
    logger.error(`Uncaught: ${err.message}`);
});

process.on('unhandledRejection', (err) => {
    logger.error(`Rejection: ${err.message}`);
});

// ============= DÉMARRAGE =============
startBot();
