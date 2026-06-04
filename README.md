# Gmail Automation

A small web app that triages a Gmail inbox: it digests incoming mail, classifies and labels messages with a mix of sender-based rules and an LLM, and surfaces a cleanup queue for low-value mail. Actions are approval-first — nothing is changed in your inbox without your confirmation.

## Stack

- React + Vite frontend
- Gmail API for inbox access and labeling
- Anthropic API for classification

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev
```

`.env.local` holds your real API keys and OAuth client ID and is gitignored — never commit it.

## Layout

```
src/
  components/   UI: inbox digest, category sections, email cards, cleanup queue,
                login, accuracy-eval panel
  lib/          gmail + anthropic clients, classification + sender rules (rules-as-data),
                ground-truth accuracy eval, helpers
```

## Accuracy check

The "📊 Accuracy check" button scores the classifier against the Gmail labels you've
already applied (your filing = ground truth), reporting per-category accuracy and
separating AI-decided from sender-rule-decided mail so the rules don't inflate the score.
