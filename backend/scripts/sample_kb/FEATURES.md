# Northwind Notes: Features (fictional sample KB)

This is a fictional product used only to exercise the ClientLens retrieval and
grounding path. None of these facts describe a real company.

## Shared workspaces

Northwind Notes organises notes into shared workspaces. Each workspace has owners,
editors, and viewers. Workspace owners can invite members by email or by a
single sign-on (SSO) domain.

## Offline sync

The desktop and mobile apps keep a full offline copy of every workspace the
user belongs to. Edits made offline are merged on reconnect using per-block
conflict resolution, so two people editing different paragraphs never collide.

## Search

Full-text search covers note bodies, attachments (PDF and DOCX), and comments.
Results are ranked by recency and by how often the note is opened.

## Integrations

Northwind Notes ships integrations for Slack, Google Drive, and Jira. The Slack
integration posts a digest of changed notes to a channel once per day.
