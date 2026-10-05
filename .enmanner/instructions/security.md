# Security and trust

## MUST

- Treat project configuration and project code as untrusted input.
- Bind local servers to loopback and do not expose them publicly.
- Never use `sudo`, change shell startup files, or install global dependencies.
- Never commit API keys, passwords, tokens, private keys, `.env`, or similar
  secret files.
- Never print secret values in launcher or server logs.
- Keep configured paths inside the project.

Enmanner runs the project's configured command with the current user's permissions.
It is not a security sandbox and agents must not describe it as one.
As defense in depth, it redacts exact configured values for declared `secret`
fields before captured output reaches its log buffer, failure reports, native
log window, or JSON Lines events. Values shorter than eight characters are not
automatically redacted because exact replacement would be too broad.
Applications must still avoid logging credentials: undeclared, shortened, or
transformed values can remain visible in persistent diagnostic transcripts.

## SHOULD

- Keep `.env` ignored by Git. When `userConfiguration` is present, expose only
  the values a person should configure and mark credentials as `secret` so the
  native UI masks them. Add an explicit project-owned template when the local
  file should be materialized on first app launch; installation itself does not
  create machine-local dotenv state.
- Curate the settings surface instead of mirroring every dotenv entry. Exclude
  derived values, ports owned by Enmanner, internal implementation switches,
  and settings a person should not safely change.
- Write every field `label` in consistent human-facing Title Case regardless of
  its dotenv spelling. Preserve canonical brand and acronym casing:
  `OPENAI_API_KEY` becomes `OpenAI API Key`, `SMTP_USERNAME` becomes
  `SMTP Username`, and `HUGGING_FACE_TOKEN` becomes `Hugging Face Token`.
- Treat `description` as a compact subtitle, not documentation. Use a short
  phrase that adds information beyond the label, prefer 45 characters or fewer,
  and never exceed 60. Omit it when the label is already sufficient. Do not pad
  it into a full sentence or repeat phrases such as “Used to” and “Enables”
  when a direct phrase is clearer.
- Mark values `required` only when the server should wait for them before its
  first launch. Required blank values open Project Settings instead of starting
  a command known to be misconfigured.
- Treat a `secret` field as presentation protection, not encrypted storage. The
  value remains in the configured dotenv file for existing project commands and
  tests.
- Consider a future optional Keychain-backed mode only when a project explicitly
  needs a different storage contract.
- Minimize third-party launcher dependencies; the MVP uses Apple frameworks and
  Swift only.
