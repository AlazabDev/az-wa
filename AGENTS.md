<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

# Project Architecture Rules

- Shared Supabase Edge Function authorization and public-destination checks belong in `_shared/access-control.ts` and `_shared/ssrf.ts` so exposed handlers fail closed consistently.
- The root route owns one Supabase auth-state listener and invalidates protected routing on identity changes, so expired sessions cannot leave private screens active.