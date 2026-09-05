# Android Architecture

## Stack and structure

Android uses Kotlin and Jetpack Compose. The app is organized around `core`, `auth`, `home`, `earn`, `missions`, `watch`, `wallet`, `withdrawal`, `referral`, `profile` and `settings`.

Screens include Splash, Onboarding, Login, Home, Earn, Missions, Watch, Wallet, Withdrawal, History, Referral, Profile, Settings and Support.

## Trust boundary

Android is an untrusted client. It has no production database, payout secret, admin secret, or authority to determine reward amounts or balances. All economically meaningful calculations are returned by the server.

## API behavior

The client sends user intent and activity evidence; it receives server decisions and current authoritative state. Access/refresh token handling is isolated in the authentication layer. Network failures must not fabricate balances or mark withdrawals completed.

## Security

Secrets are never bundled in the APK. Sensitive local storage is minimized. Device registration and session revocation are server-controlled. Client-side anti-abuse signals are supplemental; fraud decisions remain backend-owned.

## Deletion and support

Account deletion is initiated through the supported account flow and becomes a server-side retention/deletion job. Support requests are submitted to the backend and do not grant direct data-store access.
