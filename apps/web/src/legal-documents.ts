import type { MessageKey } from "@stt/shared";

export type LegalSection = {
  title: MessageKey;
  text?: MessageKey;
  items?: MessageKey[];
};

export type LegalDocument = {
  title: MessageKey;
  intro: MessageKey;
  sections: LegalSection[];
};

export const LEGAL_UPDATED_AT = "2026-11-11T12:00:00.000Z";

export const privacyPolicy: LegalDocument = {
  title: "privacy.title",
  intro: "privacy.intro",
  sections: [
    {
      title: "privacy.data.title",
      items: [
        "privacy.data.telegram",
        "privacy.data.content",
        "privacy.data.notion",
        "privacy.data.cookie",
      ],
    },
    { title: "privacy.storage.title", text: "privacy.storage.text" },
    { title: "privacy.notion.title", text: "privacy.notion.text" },
    { title: "privacy.sharing.title", text: "privacy.sharing.text" },
    { title: "privacy.deletion.title", text: "privacy.deletion.text" },
  ],
};

export const termsOfUse: LegalDocument = {
  title: "terms.title",
  intro: "terms.intro",
  sections: [
    { title: "terms.service.title", text: "terms.service.text" },
    { title: "terms.changes.title", text: "terms.changes.text" },
    { title: "terms.content.title", text: "terms.content.text" },
    { title: "terms.deletion.title", text: "terms.deletion.text" },
  ],
};
