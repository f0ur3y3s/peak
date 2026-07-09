# Account Request Flow

## Goal

Let prospective users request access from the login screen without allowing public self-signup.

## Implementation

1. Keep the existing password login flow as the only authentication path.
2. Add a login-screen toggle for `Request account`.
3. Collect requester name, email, and an optional message.
4. Insert requests into a public `account_requests` table using the Supabase anon client.
5. Show clear success and failure states in the UI.
6. Document the required Supabase table and insert-only RLS policy.

## Supabase Requirement

Email signup should remain disabled in Supabase Auth. Approved users are created manually by an admin from the Supabase dashboard.

## Verification

Run `npm run build` after implementation.
