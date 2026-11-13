import styles from "./vote.module.css";

/** プライバシーポリシー本文。運用に合わせてここを編集してください。 */
export default function PrivacyPolicy({ organizerName, contactEmail }: { organizerName?: string; contactEmail?: string }) {
  return <div className={styles.policy}>
    <p>
      {organizerName || "本投票ページの運営者"}は、この投票ページ（以下「本サービス」）において、公正な投票を実施するために以下の情報を取り扱います。
    </p>

    <h3>取得する情報</h3>
    <ul>
      <li><strong>投票用Cookie</strong>：ランダムに生成した識別子です。</li>
      <li><strong>IPアドレスのハッシュ値</strong>：元の値がわからないよう変換したIPアドレスです。</li>
      <li><strong>端末情報のハッシュ値</strong>：画面サイズや言語などの環境情報をもとに生成した値です。</li>
      <li><strong>投票・引換権の記録</strong>：投票した部門と候補、権利の取得日時と使用状況です。</li>
    </ul>
    <p>氏名・メールアドレスなど、個人を直接特定する情報は取得しません。</p>

    <h3>利用目的</h3>
    <ul>
      <li>同一ブラウザ、またはIPとブラウザ環境が一致する投票の重複を検出・制限するため</li>
      <li>Cookieを削除しても繰り返される大量の送信を制限するため</li>
      <li>不審な投票を検出・監視するため（別人を誤判定する可能性もあります）</li>
      <li>投票結果の集計と、権利の発行・使用状況の管理のため</li>
    </ul>

    <h3>外部サービスの利用</h3>
    <p>
      不正アクセス対策としてCloudflare Turnstileを利用しています。Turnstileによって取得される情報は、Cloudflare社のプライバシーポリシーに従って取り扱われます。
    </p>

    <h3>お問い合わせ</h3>
    <p>本ポリシーに関するお問い合わせは、{contactEmail
      ? <a href={"mailto:" + contactEmail}>{contactEmail}</a>
      : (organizerName || "本投票ページの運営者")}までお寄せください。</p>
  </div>;
}
