import http from "node:http";
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import {
  loadDb,
  withDb,
  roundMoney,
  getOrCreateAccount,
  transfer,
  deposit,
  addWarn,
  removeWarn,
  getActiveWarns,
  createInvoice,
  getOpenInvoicesFor,
  payInvoice,
  setCitizenship,
  getCitizenship,
  payAllSalaries,
} from "./storage.js";
import { pickImage } from "./images.js";

// ===== COSTANTI =====
const PREFIX = "!";
const WARN_LIMIT = 6;
const STATUS_MESSAGES = ["Vi Guardo!", "Venite su NY!", "Occhio", "Bella ragassi"];
const PRESENCE_INTERVAL_MS = 30_000;
const SALARY_INTERVAL_MS = 60 * 60 * 1000;
const WELCOME_BONUS = 1000;

const COLORS = {
  primary: 0x5865f2,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  info: 0x5dade2,
  dark: 0x2b2d31,
  gold: 0xf1c40f,
};

// ===== UTILITY EMBED =====
const formatMoney = (n) =>
  `$ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const makeEmbed = (title, description, color = COLORS.primary) => {
  const e = new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
  if (description) e.setDescription(description);
  return e;
};

const errorEmbed = (msg) => makeEmbed("❌ Errore", msg, COLORS.danger);
const successEmbed = (title, msg) => makeEmbed(title, msg, COLORS.success);

// ===== HELPER PARSING =====
async function requirePerm(message, perm, label) {
  if (!message.member) {
    await message.reply({ embeds: [errorEmbed("Comando utilizzabile solo nel server.")] });
    return false;
  }
  if (!message.member.permissions.has(perm)) {
    await message.reply({ embeds: [errorEmbed(`Ti serve il permesso **${label}**.`)] });
    return false;
  }
  return true;
}

function getUserId(message, arg) {
  const mention = message.mentions.users.first();
  if (mention) return mention.id;
  if (arg && /^\d{17,20}$/.test(arg)) return arg;
  return null;
}

function parseAmount(raw) {
  if (!raw) return null;
  const v = Number(String(raw).replace(/[\s,]/g, ""));
  return Number.isFinite(v) && v > 0 ? roundMoney(v) : null;
}

function parseDuration(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^(\d+)([smhd])$/i);
  if (!m) return null;
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2].toLowerCase()];
  return Number(m[1]) * mult;
}

function stripMentionArgs(args) {
  return args.filter((a) => !a.startsWith("<@") && !/^\d{17,20}$/.test(a));
}

async function fetchUser(client, id) {
  return client.users.fetch(id).catch(() => null);
}

// ============================================================
//                           ECONOMIA
// ============================================================

async function cmdConto(message, args) {
  const id = getUserId(message, args[0]) ?? message.author.id;
  await withDb(async (db) => {
    const acc = getOrCreateAccount(db, id);
    const u = await fetchUser(message.client, id);
    const e = makeEmbed("💳 Conto bancario", null, COLORS.gold)
      .setThumbnail(u?.displayAvatarURL() ?? null)
      .setImage(pickImage("bank"))
      .addFields(
        { name: "Titolare", value: u?.tag ?? id, inline: true },
        { name: "Saldo", value: formatMoney(acc.balance), inline: true },
        { name: "Stipendio", value: `${formatMoney(acc.salary)}/h`, inline: true },
        { name: "Lavoro", value: acc.job ?? "Nessuno", inline: true },
      );
    await message.reply({ embeds: [e] });
  });
}

async function cmdCreaConto(message) {
  await withDb(async (db) => {
    if (db.accounts[message.author.id]) {
      await message.reply({ embeds: [errorEmbed("Hai già un conto.")] });
      return;
    }
    deposit(db, message.author.id, WELCOME_BONUS);
    await message.reply({
      embeds: [
        successEmbed("🏦 Conto creato", `Bonus benvenuto: **${formatMoney(WELCOME_BONUS)}**`)
          .setImage(pickImage("bank")),
      ],
    });
  });
}

async function cmdPaga(message, args) {
  const id = getUserId(message, args[0]);
  if (!id || id === message.author.id) {
    await message.reply({ embeds: [errorEmbed("Sintassi: `!paga @utente <importo> [causale]`")] });
    return;
  }
  const rest = stripMentionArgs(args.slice(1));
  const amount = parseAmount(rest[0]);
  if (!amount) {
    await message.reply({ embeds: [errorEmbed("Importo non valido.")] });
    return;
  }
  const reason = rest.slice(1).join(" ") || "Pagamento";
  await withDb(async (db) => {
    try {
      transfer(db, message.author.id, id, amount);
    } catch (err) {
      await message.reply({ embeds: [errorEmbed(err.message)] });
      return;
    }
    const target = await fetchUser(message.client, id);
    await message.reply({
      embeds: [
        successEmbed(
          "💸 Pagamento effettuato",
          `Inviati **${formatMoney(amount)}** a ${target?.tag ?? id}.\nCausale: *${reason}*`,
        ).setImage(pickImage("money")),
      ],
    });
  });
}

async function cmdFattura(message, args) {
  const id = getUserId(message, args[0]);
  if (!id) {
    await message.reply({ embeds: [errorEmbed("Sintassi: `!fattura @utente <importo> <descrizione>`")] });
    return;
  }
  const rest = stripMentionArgs(args.slice(1));
  const amount = parseAmount(rest[0]);
  if (!amount) {
    await message.reply({ embeds: [errorEmbed("Importo non valido.")] });
    return;
  }
  const desc = rest.slice(1).join(" ") || "Fattura";
  await withDb(async (db) => {
    const inv = createInvoice(db, message.author.id, id, amount, desc);
    const target = await fetchUser(message.client, id);
    const e = makeEmbed("🧾 Fattura emessa", null, COLORS.gold)
      .setImage(pickImage("invoice"))
      .addFields(
        { name: "ID", value: `\`${inv.id}\`` },
        { name: "Da", value: message.author.tag, inline: true },
        { name: "A", value: target?.tag ?? id, inline: true },
        { name: "Importo", value: formatMoney(amount), inline: true },
        { name: "Descrizione", value: desc },
      )
      .setFooter({ text: "Pagala con: !pagafattura <ID>" });
    await message.channel.send({ content: target ? `<@${id}>` : undefined, embeds: [e] });
  });
}

async function cmdFatture(message) {
  await withDb(async (db) => {
    const mine = getOpenInvoicesFor(db, message.author.id);
    if (!mine.length) {
      await message.reply({
        embeds: [
          makeEmbed("🧾 Le tue fatture", "Nessuna fattura aperta.", COLORS.info)
            .setImage(pickImage("invoice")),
        ],
      });
      return;
    }
    const lines = await Promise.all(
      mine.slice(0, 15).map(async (i) => {
        const dir = i.toUserId === message.author.id ? "📥 DA PAGARE" : "📤 EMESSA";
        const otherId = i.toUserId === message.author.id ? i.fromUserId : i.toUserId;
        const u = await fetchUser(message.client, otherId);
        return `**${dir}** \`${i.id}\` — ${formatMoney(i.amount)} (${u?.tag ?? otherId})\n*${i.description}*`;
      }),
    );
    await message.reply({
      embeds: [
        makeEmbed("🧾 Le tue fatture", lines.join("\n\n"), COLORS.gold).setImage(pickImage("invoice")),
      ],
    });
  });
}

async function cmdPagaFattura(message, args) {
  if (!args[0]) {
    await message.reply({ embeds: [errorEmbed("Sintassi: `!pagafattura <ID>`")] });
    return;
  }
  await withDb(async (db) => {
    try {
      const inv = payInvoice(db, args[0], message.author.id);
      await message.reply({
        embeds: [
          successEmbed(
            "✅ Fattura pagata",
            `Pagati **${formatMoney(inv.amount)}**\n*${inv.description}*`,
          ).setImage(pickImage("money")),
        ],
      });
    } catch (err) {
      await message.reply({ embeds: [errorEmbed(err.message)] });
    }
  });
}

async function cmdSetStipendio(message, args) {
  if (!(await requirePerm(message, PermissionFlagsBits.ManageGuild, "Gestire il server"))) return;
  const id = getUserId(message, args[0]);
  if (!id) {
    await message.reply({ embeds: [errorEmbed("Sintassi: `!setstipendio @utente <importo/h> [lavoro]`")] });
    return;
  }
  const rest = stripMentionArgs(args.slice(1));
  const amount = Number(String(rest[0] ?? "").replace(/[\s,]/g, ""));
  if (!Number.isFinite(amount) || amount < 0) {
    await message.reply({ embeds: [errorEmbed("Importo non valido.")] });
    return;
  }
  const job = rest.slice(1).join(" ") || null;
  await withDb(async (db) => {
    const acc = getOrCreateAccount(db, id);
    acc.salary = roundMoney(amount);
    if (job) acc.job = job;
    const u = await fetchUser(message.client, id);
    await message.reply({
      embeds: [
        successEmbed(
          "💼 Stipendio impostato",
          `${u?.tag ?? id} riceverà **${formatMoney(acc.salary)}/h**${job ? ` come *${job}*` : ""}.`,
        ).setImage(pickImage("money")),
      ],
    });
  });
}

// ============================================================
//                        CITTADINANZA
// ============================================================

async function cmdCreaCitt(message, args) {
  const parts = args.join(" ").split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 4) {
    await message.reply({
      embeds: [errorEmbed("Sintassi: `!creacittadinanza Nome | GG/MM/AAAA | Nazionalità | Lavoro`")],
    });
    return;
  }
  const [fullName, birthDate, nationality, job] = parts;
  await withDb(async (db) => {
    if (getCitizenship(db, message.author.id)) {
      await message.reply({
        embeds: [errorEmbed("Hai già una cittadinanza. Usa `!modificacittadinanza`.")],
      });
      return;
    }
    setCitizenship(db, message.author.id, { fullName, birthDate, nationality, job });
    const e = makeEmbed("🪪 Cittadinanza rilasciata", null, COLORS.info)
      .setThumbnail(message.author.displayAvatarURL())
      .setImage(pickImage("citizenship"))
      .addFields(
        { name: "Nome completo", value: fullName, inline: true },
        { name: "Nascita", value: birthDate, inline: true },
        { name: "Nazionalità", value: nationality, inline: true },
        { name: "Lavoro", value: job, inline: true },
        { name: "Codice", value: `\`${message.author.id}\`` },
      );
    await message.reply({ embeds: [e] });
  });
}

async function cmdModCitt(message, args) {
  const parts = args.join(" ").split("|").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 4) {
    await message.reply({
      embeds: [errorEmbed("Sintassi: `!modificacittadinanza Nome | GG/MM/AAAA | Nazionalità | Lavoro`")],
    });
    return;
  }
  const [fullName, birthDate, nationality, job] = parts;
  await withDb(async (db) => {
    if (!getCitizenship(db, message.author.id)) {
      await message.reply({ embeds: [errorEmbed("Nessuna cittadinanza. Usa `!creacittadinanza`.")] });
      return;
    }
    setCitizenship(db, message.author.id, { fullName, birthDate, nationality, job });
    await message.reply({
      embeds: [successEmbed("🪪 Cittadinanza aggiornata").setImage(pickImage("citizenship"))],
    });
  });
}

async function cmdCitt(message, args) {
  const id = getUserId(message, args[0]) ?? message.author.id;
  await withDb(async (db) => {
    const c = getCitizenship(db, id);
    if (!c) {
      await message.reply({ embeds: [errorEmbed("Nessuna cittadinanza trovata.")] });
      return;
    }
    const u = await fetchUser(message.client, id);
    const e = makeEmbed("🪪 Documento di cittadinanza", null, COLORS.info)
      .setThumbnail(u?.displayAvatarURL() ?? null)
      .setImage(pickImage("citizenship"))
      .addFields(
        { name: "Nome completo", value: c.fullName, inline: true },
        { name: "Nascita", value: c.birthDate, inline: true },
        { name: "Nazionalità", value: c.nationality, inline: true },
        { name: "Lavoro", value: c.job, inline: true },
        { name: "Account", value: u?.tag ?? id, inline: true },
      );
    await message.reply({ embeds: [e] });
  });
}

// ============================================================
//                       ROLEPLAY / EVENTI
// ============================================================

async function cmdOnRp(message) {
  if (!(await requirePerm(message, PermissionFlagsBits.ManageMessages, "Gestire messaggi"))) return;
  await withDb((db) => {
    db.state.rpStatus = "on";
    db.state.rpChangedAt = Date.now();
  });
  await message.channel.send({
    content: "@here",
    embeds: [
      makeEmbed(
        "🟢 ROLEPLAY ON",
        `Il roleplay è ufficialmente **APERTO**.\nAvviato da ${message.author}.\nLe strade di **New York** sono vive!`,
        COLORS.success,
      ).setImage(pickImage("nycDay")),
    ],
  });
}

async function cmdOffRp(message) {
  if (!(await requirePerm(message, PermissionFlagsBits.ManageMessages, "Gestire messaggi"))) return;
  await withDb((db) => {
    db.state.rpStatus = "off";
    db.state.rpChangedAt = Date.now();
  });
  await message.channel.send({
    content: "@here",
    embeds: [
      makeEmbed(
        "🔴 ROLEPLAY OFF",
        `Il roleplay è ufficialmente **CHIUSO**.\nChiuso da ${message.author}.\nLe luci di **New York** si spengono.`,
        COLORS.danger,
      ).setImage(pickImage("nycNight")),
    ],
  });
}

async function cmdEventOn(message, args) {
  if (!(await requirePerm(message, PermissionFlagsBits.ManageMessages, "Gestire messaggi"))) return;
  const desc = args.join(" ") || "Un evento speciale è in corso!";
  await withDb((db) => {
    db.state.eventStatus = "on";
    db.state.eventChangedAt = Date.now();
  });
  await message.channel.send({
    content: "@here",
    embeds: [
      makeEmbed("🎉 EVENTO ATTIVO", desc, COLORS.gold)
        .setImage(pickImage("event"))
        .setFooter({ text: `Avviato da ${message.author.tag}` }),
    ],
  });
}

async function cmdEventOff(message) {
  if (!(await requirePerm(message, PermissionFlagsBits.ManageMessages, "Gestire messaggi"))) return;
  await withDb((db) => {
    db.state.eventStatus = "off";
    db.state.eventChangedAt = Date.now();
  });
  await message.channel.send({
    embeds: [
      makeEmbed("🏁 EVENTO TERMINATO", `Chiuso da ${message.author}.`, COLORS.danger)
        .setImage(pickImage("event")),
    ],
  });
}

async function cmdStatus(message) {
  await withDb(async (db) => {
    await message.reply({
      embeds: [
        makeEmbed("📊 Stato del server", null, COLORS.info)
          .setImage(pickImage(db.state.rpStatus === "on" ? "nycDay" : "nycNight"))
          .addFields(
            { name: "Roleplay", value: db.state.rpStatus === "on" ? "🟢 ON" : "🔴 OFF", inline: true },
            { name: "Evento", value: db.state.eventStatus === "on" ? "🟢 ON" : "🔴 OFF", inline: true },
          ),
      ],
    });
  });
}

async function cmdRoll(message, args) {
  const max = Math.max(2, Math.floor(Number(args[0] ?? 100)) || 100);
  const r = Math.floor(Math.random() * max) + 1;
  await message.reply({
    embeds: [
      makeEmbed("🎲 Tiro di dado", `${message.author} ha tirato un **${r}** (1-${max})`, COLORS.gold)
        .setThumbnail(pickImage("dice")),
    ],
  });
}

// ============================================================
//                          ANNUNCI
// ============================================================

async function cmdAnnuncio(message, args) {
  if (!(await requirePerm(message, PermissionFlagsBits.ManageMessages, "Gestire messaggi"))) return;
  const mentions = [];
  const rest = [];
  for (const a of args) {
    if (a === "@everyone" || a === "@here" || /^<@[!&]?\d+>$/.test(a)) mentions.push(a);
    else rest.push(a);
  }
  const text = rest.join(" ");
  if (!text) {
    await message.reply({ embeds: [errorEmbed("Devi scrivere il testo dell'annuncio.")] });
    return;
  }
  await message.channel.send({
    content: mentions.join(" ") || undefined,
    embeds: [
      makeEmbed("📢 ANNUNCIO UFFICIALE", text, COLORS.primary)
        .setImage(pickImage("announcement"))
        .setFooter({ text: `Annuncio di ${message.author.tag}` }),
    ],
    allowedMentions: { parse: ["everyone", "roles", "users"] },
  });
  if (message.deletable) await message.delete().catch(() => {});
}

async function cmdNews(message, args) {
  if (!(await requirePerm(message, PermissionFlagsBits.ManageMessages, "Gestire messaggi"))) return;
  const parts = args.join(" ").split("|").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) {
    await message.reply({ embeds: [errorEmbed("Sintassi: `!news Titolo | Sottotitolo | Corpo`")] });
    return;
  }
  const title = parts[0];
  const subtitle = parts.length >= 3 ? parts[1] : null;
  const body = parts.length >= 3 ? parts.slice(2).join("\n\n") : parts.slice(1).join("\n\n");
  const e = makeEmbed(`📰 ${title.toUpperCase()}`, null, COLORS.dark)
    .setAuthor({ name: "TESTATA GIORNALISTICA UFFICIALE" })
    .setImage(pickImage("news"))
    .setFooter({ text: `Redatto da ${message.author.tag}` });
  if (subtitle) e.setDescription(`*${subtitle}*`);
  if (body) {
    for (let i = 0; i < body.length; i += 1024) {
      e.addFields({ name: "\u200b", value: body.slice(i, i + 1024) });
    }
  }
  await message.channel.send({ embeds: [e] });
  if (message.deletable) await message.delete().catch(() => {});
}

async function cmdVotazione(message, args) {
  if (!(await requirePerm(message, PermissionFlagsBits.ManageMessages, "Gestire messaggi"))) return;
  const q = args.join(" ").trim() || "Chi per roleplay 21:00?";
  const sent = await message.channel.send({
    content: "@here",
    embeds: [
      makeEmbed("🗳️ VOTAZIONE", q, COLORS.info)
        .setImage(pickImage("vote"))
        .addFields({ name: "Come votare", value: "Reagisci con ✅ o ❌." })
        .setFooter({ text: `Aperta da ${message.author.tag}` }),
    ],
  });
  await sent.react("✅").catch(() => {});
  await sent.react("❌").catch(() => {});
  if (message.deletable) await message.delete().catch(() => {});
}

// ============================================================
//                        MODERAZIONE
// ============================================================

async function cmdWarn(message, args) {
  if (!(await requirePerm(message, PermissionFlagsBits.ModerateMembers, "Moderare membri"))) return;
  const id = getUserId(message, args[0]);
  if (!id) {
    await message.reply({ embeds: [errorEmbed("Sintassi: `!warn @utente <motivo>`")] });
    return;
  }
  const reason = stripMentionArgs(args.slice(1)).join(" ") || "Nessun motivo";

  await withDb(async (db) => {
    addWarn(db, id, message.author.id, reason);
    const active = getActiveWarns(db, id);
    const u = await fetchUser(message.client, id);

    await message.channel.send({
      content: u ? `<@${id}>` : undefined,
      embeds: [
        makeEmbed("⚠️ Punto Ban assegnato", null, COLORS.warning)
          .setThumbnail(u?.displayAvatarURL() ?? null)
          .setImage(pickImage("warn"))
          .addFields(
            { name: "Utente", value: u?.tag ?? id, inline: true },
            { name: "Punti", value: `${active.length}/${WARN_LIMIT}`, inline: true },
            { name: "Moderatore", value: message.author.tag, inline: true },
            { name: "Motivo", value: reason },
            { name: "Scadenza", value: "Tra 1 mese" },
          ),
      ],
    });

    if (active.length >= WARN_LIMIT && message.guild) {
      try {
        const mem = await message.guild.members.fetch(id);
        await mem.ban({ reason: `${WARN_LIMIT} punti ban — ban automatico permanente` });
        await message.channel.send({
          embeds: [
            makeEmbed(
              "⛔ BAN PERMANENTE AUTOMATICO",
              `${u?.tag ?? id} ha raggiunto **${WARN_LIMIT}/${WARN_LIMIT}** punti ed è stato bannato.`,
              COLORS.danger,
            ).setImage(pickImage("ban")),
          ],
        });
      } catch (err) {
        await message.channel.send({ embeds: [errorEmbed(`Ban automatico fallito: ${err.message}`)] });
      }
    }
  });
}

async function cmdWarns(message, args
