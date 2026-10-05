# Collaboration

Treat collaboration as a product architecture change, not a networking toggle.

When someone asks to “let another person use this app,” first distinguish:

- another account on the same Mac
- another device on the local network
- a remotely hosted copy
- real-time synchronization
- shared ownership of one dataset

Do not simply change the bind address to `0.0.0.0`. Before implementing, account
for authentication, authorization, encryption, privacy, backup ownership,
conflict resolution, and the threat model—especially for personal or financial
data. Enmanner's MVP is intentionally single-user and loopback-only.
