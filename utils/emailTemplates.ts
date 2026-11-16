import { escapeHtml } from "./sendEmail";

// The 6 system emails of Master Briefing v4 (part 6), each in NL, EN and FR
// (18 in all). Welcome and invite mails come from info@, alerts and resets
// from noreply@ with Reply-To info@ (see utils/sendEmail.ts, `from`).

export type EmailLanguage = "nl" | "en" | "fr";

/** The recipient's own language if set; otherwise by the hotel's country (NL → nl, FR/LU → fr), else English. */
export function languageFor(input: { language?: string | null; country?: string | null }): EmailLanguage {
  if (input.language === "nl" || input.language === "en" || input.language === "fr") return input.language;
  if (input.country === "NL" || input.country === "BE") return "nl";
  if (input.country === "FR" || input.country === "LU") return "fr";
  return "en";
}

const e = escapeHtml;
const b = (v: string) => `<strong>${e(v)}</strong>`;
const link = (href: string, label: string) => `<a href="${e(href)}" style="color:#9f7b3b">${e(label)}</a>`;
const wrap = (paragraphs: string[]) => paragraphs.map((p) => `<p>${p}</p>`).join("\n");

type Mail = { subject: string; html: string; from: "info" | "noreply" };

/** 6.1 Welcome email — new hotel (from info@). */
export function welcomeHotel(lang: EmailLanguage, v: { managerName: string; hotelName: string; loginLink: string; founding: boolean }): Mail {
  const t = {
    nl: {
      subject: `Welkom bij HotelConnect Network — ${v.hotelName} is aangemeld`,
      body: [
        `Beste ${e(v.managerName)},`,
        `Welkom bij HotelConnect Network. Uw account voor ${b(v.hotelName)} is aangemaakt. ${v.founding ? "Als een van onze eerste 10 Founding Hotels ontvangt u het eerste jaar volledig gratis (0% commissie)." : "U betaalt 0% commissie op alles."}`,
        `Log direct in: ${link(v.loginLink, v.loginLink)}. Vragen? Beantwoord deze mail (info@hotelconnectnetwork.com).`,
        `Met gastvrije groet,<br>Team HotelConnect Network`,
      ],
    },
    en: {
      subject: `Welcome to HotelConnect Network — ${v.hotelName} is registered`,
      body: [
        `Dear ${e(v.managerName)},`,
        `Welcome to HotelConnect Network. Your account for ${b(v.hotelName)} is ready. ${v.founding ? "As one of our first 10 Founding Hotels, your first year is 100% free (0% commission)." : "You pay 0% commission on everything."}`,
        `Log in now: ${link(v.loginLink, v.loginLink)}. Questions? Reply to info@hotelconnectnetwork.com.`,
        `Warm regards,<br>Team HotelConnect Network`,
      ],
    },
    fr: {
      subject: `Bienvenue sur HotelConnect Network — ${v.hotelName} est inscrit`,
      body: [
        `Bonjour ${e(v.managerName)},`,
        `Bienvenue sur HotelConnect Network. Votre compte pour ${b(v.hotelName)} est prêt. ${v.founding ? "En tant que l'un de nos 10 premiers hôtels fondateurs, votre première année est 100 % gratuite (0 % de commission)." : "Vous payez 0 % de commission sur tout."}`,
        `Connectez-vous : ${link(v.loginLink, v.loginLink)}.`,
        `Cordialement,<br>L'équipe HotelConnect Network`,
      ],
    },
  }[lang];
  return { subject: t.subject, html: wrap(t.body), from: "info" };
}

/** 6.2 1-click supplier invitation (from info@). */
export function supplierInvite(lang: EmailLanguage, v: { hotelName: string; city: string; inviteLink: string }): Mail {
  const t = {
    nl: {
      subject: `${v.hotelName} werkt samen met u via HotelConnect Network (Gratis tot 1 mei 2028)`,
      body: [
        `Beste relatie,`,
        `${b(v.hotelName)} in ${e(v.city)} heeft uw bedrijf toegevoegd als vaste servicepartner binnen HotelConnect Network. Ontvang directe aanvragen van boetiekhotels zonder commissie (<strong>100% gratis tot 1 mei 2028</strong>).`,
        `Activeer uw profiel: ${link(v.inviteLink, "Profiel activeren")}`,
        `Met vriendelijke groet,<br>Team HotelConnect Network`,
      ],
    },
    en: {
      subject: `${v.hotelName} connects with you on HotelConnect Network (Free until May 1, 2028)`,
      body: [
        `Dear Partner,`,
        `${b(v.hotelName)} in ${e(v.city)} has listed your company as a trusted partner on HotelConnect Network. Receive direct hotel tenders with 0% commission (<strong>100% free until May 1, 2028</strong>).`,
        `Activate your profile: ${link(v.inviteLink, "Activate your profile")}`,
        `Kind regards,<br>Team HotelConnect Network`,
      ],
    },
    fr: {
      subject: `${v.hotelName} vous invite sur HotelConnect Network (Gratuit jusqu'au 1er mai 2028)`,
      body: [
        `Madame, Monsieur,`,
        `${b(v.hotelName)} à ${e(v.city)} vous a ajouté comme partenaire de confiance. Recevez des appels d'offres hôteliers avec 0 % de commission (<strong>100 % gratuit jusqu'au 1er mai 2028</strong>).`,
        `Activez votre profil : ${link(v.inviteLink, "Activer votre profil")}`,
        `Cordialement,<br>L'équipe HotelConnect Network`,
      ],
    },
  }[lang];
  return { subject: t.subject, html: wrap(t.body), from: "info" };
}

/** 6.3 Welcome email — new supplier (from info@). */
export function welcomeSupplier(lang: EmailLanguage, v: { supplierName: string; portalLink: string }): Mail {
  const t = {
    nl: {
      subject: "Welkom bij HotelConnect Network — Uw leveranciersaccount is actief",
      body: [
        `Beste ${e(v.supplierName)},`,
        `Uw bedrijfsprofiel is geactiveerd. Tot <strong>1 mei 2028</strong> maakt u <strong>100% gratis</strong> gebruik van het platform met <strong>0% commissie</strong>.`,
        `Log in op uw Leveranciers Portaal: ${link(v.portalLink, v.portalLink)}`,
        `Met vriendelijke groet,<br>Team HotelConnect Network`,
      ],
    },
    en: {
      subject: "Welcome to HotelConnect Network — Your supplier account is active",
      body: [
        `Dear ${e(v.supplierName)},`,
        `Your company profile is active. Until <strong>May 1, 2028</strong>, enjoy <strong>100% free</strong> access with <strong>0% commission</strong>.`,
        `Log in to your Supplier Portal: ${link(v.portalLink, v.portalLink)}`,
        `Kind regards,<br>Team HotelConnect Network`,
      ],
    },
    fr: {
      subject: "Bienvenue sur HotelConnect Network — Votre compte fournisseur est actif",
      body: [
        `Bonjour ${e(v.supplierName)},`,
        `Votre profil est actif. Jusqu'au <strong>1er mai 2028</strong>, profitez d'un accès <strong>100 % gratuit</strong> avec <strong>0 % de commission</strong>.`,
        `Connectez-vous : ${link(v.portalLink, v.portalLink)}`,
        `Cordialement,<br>L'équipe HotelConnect Network`,
      ],
    },
  }[lang];
  return { subject: t.subject, html: wrap(t.body), from: "info" };
}

/** 6.4 New tender alert (from noreply@, Reply-To info@). */
export function tenderAlert(lang: EmailLanguage, v: { supplierName: string; trade: string; city: string; title: string; timeline: string; tenderLink: string }): Mail {
  const t = {
    nl: {
      subject: `Nieuwe hotelaanvraag in uw regio: ${v.title} (${v.city})`,
      body: [
        `Beste ${e(v.supplierName)},`,
        `Er is een nieuwe aanvraag geplaatst in uw vakgebied (${b(v.trade)}) in ${b(v.city)}: ${e(v.title)} (Uitvoering: ${e(v.timeline)}).`,
        `Log in om de details en contactgegevens te bekijken: ${link(v.tenderLink, "Bekijk de aanvraag")}`,
        `Team HotelConnect Network`,
      ],
    },
    en: {
      subject: `New hotel tender in your region: ${v.title} (${v.city})`,
      body: [
        `Dear ${e(v.supplierName)},`,
        `A new tender has been posted in your trade (${b(v.trade)}) in ${b(v.city)}: ${e(v.title)} (Timeline: ${e(v.timeline)}).`,
        `Log in to view details and hotel contact email: ${link(v.tenderLink, "View the tender")}`,
        `Team HotelConnect Network`,
      ],
    },
    fr: {
      subject: `Nouvel appel d'offres hôtelier : ${v.title} (${v.city})`,
      body: [
        `Bonjour ${e(v.supplierName)},`,
        `Un nouvel appel d'offres est publié dans votre secteur (${b(v.trade)}) à ${b(v.city)} : ${e(v.title)} (Période : ${e(v.timeline)}).`,
        `Connectez-vous : ${link(v.tenderLink, "Voir l'appel d'offres")}`,
        `L'équipe HotelConnect Network`,
      ],
    },
  }[lang];
  return { subject: t.subject, html: wrap(t.body), from: "noreply" };
}

/** 6.5 Contract, certificate & permit reminder (from noreply@, Reply-To info@). */
export function complianceReminder(lang: EmailLanguage, v: { managerName: string; hotelName: string; itemName: string; supplierName: string; expiryDate: string; notice: string; dashboardLink: string }): Mail {
  const who = v.supplierName ? ` (${e(v.supplierName)})` : "";
  const t = {
    nl: {
      subject: `Actie vereist: Vervaldatum of opzegtermijn voor ${v.itemName} (${v.hotelName})`,
      body: [
        `Beste ${e(v.managerName)},`,
        `Automatische herinnering voor ${b(v.hotelName)}: ${b(v.itemName)}${who} • Einddatum: ${e(v.expiryDate)} • Opzegtermijn/Herinnering: ${e(v.notice)}.`,
        `Bekijk in uw dashboard: ${link(v.dashboardLink, "Open het dashboard")}`,
        `Team HotelConnect Network`,
      ],
    },
    en: {
      subject: `Action required: Expiration or notice deadline for ${v.itemName} (${v.hotelName})`,
      body: [
        `Dear ${e(v.managerName)},`,
        `Automated reminder for ${b(v.hotelName)}: ${b(v.itemName)}${who} • End Date: ${e(v.expiryDate)} • Notice/Reminder: ${e(v.notice)}.`,
        `Review in dashboard: ${link(v.dashboardLink, "Open the dashboard")}`,
        `Team HotelConnect Network`,
      ],
    },
    fr: {
      subject: `Action requise : Échéance pour ${v.itemName} (${v.hotelName})`,
      body: [
        `Bonjour ${e(v.managerName)},`,
        `Rappel automatique pour ${b(v.hotelName)} : ${b(v.itemName)}${who} • Échéance : ${e(v.expiryDate)} • Préavis/Rappel : ${e(v.notice)}.`,
        `Consultez votre tableau de bord : ${link(v.dashboardLink, "Ouvrir le tableau de bord")}`,
        `L'équipe HotelConnect Network`,
      ],
    },
  }[lang];
  return { subject: t.subject, html: wrap(t.body), from: "noreply" };
}

/** 6.6 Login link / password reset, valid 24 hours (from noreply@, Reply-To info@). Also carries the 6-digit code. */
export function passwordReset(lang: EmailLanguage, v: { userName: string; accountName: string; resetLink: string; code: string }): Mail {
  const t = {
    nl: {
      subject: "Uw inloglink / wachtwoord herstellen — HotelConnect Network",
      body: [
        `Beste ${e(v.userName)},`,
        `Gebruik deze link (24 uur geldig) om in te loggen of uw wachtwoord te herstellen voor ${b(v.accountName)}: ${link(v.resetLink, "Wachtwoord herstellen")}`,
        `Of vul deze code in op het scherm waar u bent: <strong>${e(v.code)}</strong> (5 minuten geldig).`,
        `Hulp nodig? Mail info@hotelconnectnetwork.com.<br>Team HotelConnect Network`,
      ],
    },
    en: {
      subject: "Your login link / password reset — HotelConnect Network",
      body: [
        `Dear ${e(v.userName)},`,
        `Use this link (valid for 24 hours) to log in or reset your password for ${b(v.accountName)}: ${link(v.resetLink, "Reset your password")}`,
        `Or enter this code on the screen you are on: <strong>${e(v.code)}</strong> (valid for 5 minutes).`,
        `Need help? Contact info@hotelconnectnetwork.com.<br>Team HotelConnect Network`,
      ],
    },
    fr: {
      subject: "Votre lien de connexion / réinitialisation — HotelConnect Network",
      body: [
        `Bonjour ${e(v.userName)},`,
        `Utilisez ce lien (valable 24h) pour vous connecter ou réinitialiser votre mot de passe pour ${b(v.accountName)} : ${link(v.resetLink, "Réinitialiser le mot de passe")}`,
        `Ou saisissez ce code sur l'écran où vous êtes : <strong>${e(v.code)}</strong> (valable 5 minutes).`,
        `Besoin d'aide ? info@hotelconnectnetwork.com.<br>L'équipe HotelConnect Network`,
      ],
    },
  }[lang];
  return { subject: t.subject, html: wrap(t.body), from: "noreply" };
}
