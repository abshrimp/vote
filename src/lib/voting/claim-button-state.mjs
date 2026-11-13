/**
 * Presentation state for a claim button. Eligibility and redemption remain
 * server-authoritative; this only describes the current client-side state.
 */
export function claimButtonState({
  eligible, hasToken, isSaving, siteKey, verificationError, claimLabel, lockedLabel,
}) {
  if (isSaving) return { label: "処理中…", busy: true };
  if (!eligible) return { label: lockedLabel || "条件を満たすと引き換えられます", busy: false };
  if (!siteKey) return { label: "本人確認を利用できません", busy: false };
  if (verificationError) return { label: "本人確認を再試行してください", busy: false };
  if (!hasToken) return { label: "本人確認中…", busy: true };
  return { label: claimLabel || "引き換える", busy: false };
}
