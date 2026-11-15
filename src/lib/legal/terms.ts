/**
 * The terms of service, as data.
 *
 * Why a module and not a page full of prose: the signup action stamps
 * `profiles.terms_version` with TERMS_VERSION, and the page renders the
 * clauses below. One constant, one document. If the copy and the recorded
 * version could drift, the record of consent would be worthless — "they
 * agreed on 15 November" says nothing unless we can produce what they
 * agreed to.
 *
 * Change the copy, change the version, in the same commit. A date is the
 * version because that is what a dispute is argued about.
 *
 * NOT reviewed by a lawyer. This is deliberately strong on the client's
 * instruction, and §16 is what keeps it that way: a blanket "we are liable
 * for nothing" is void against an Indian consumer under the Consumer
 * Protection Act 2019, and a clause a court strikes out protects nobody.
 * Carving out the rights that cannot be excluded is what leaves the rest
 * standing.
 */
export const TERMS_VERSION = "2026-11-15";

export const TERMS_EFFECTIVE = "15 November 2026";

export const COMPANY = "TradeForce";

/**
 * The seat of jurisdiction in clause 20.
 *
 * "India" is the honest placeholder: naming a city is the client's call and I
 * do not know where the business is registered. A clause that names the wrong
 * city is worse than one that names the country, because the wrong city is
 * arguably no agreement on jurisdiction at all. Set this to the city the
 * business is registered in — and bump TERMS_VERSION when you do.
 */
export const TERMS_SEAT = "India";

export type Clause = {
  id: string;
  heading: string;
  body: string[];
};

export const TERMS: Clause[] = [
  {
    id: "what-this-is",
    heading: "1. What you are agreeing to",
    body: [
      `These terms are a binding agreement between you and ${COMPANY} ("we", "us", "our"). They cover the ${COMPANY} website, dashboard, Expert Advisor, hosted terminal, API and everything else we provide (together, the "Service").`,
      "By creating an account, ticking the box at signup, paying us, installing the Expert Advisor, or using the Service in any way, you accept these terms in full. If you do not accept them, do not create an account and do not use the Service.",
      "You confirm that you are at least 18 years old, legally able to enter into this agreement, and not barred from using the Service under the law of the place you are in.",
    ],
  },
  {
    id: "what-the-service-does",
    heading: "2. What the Service does, and what it does not",
    body: [
      "You write a set of trading rules — a daily loss limit, a maximum number of trades, a maximum number of open positions, a risk cap per trade, and the hours you are allowed to trade. Our Expert Advisor runs inside MetaTrader and tries to stop you breaking them.",
      "That is the whole of it. The Service is a discipline tool. It is not a trading system, a signal service, a broker, a portfolio manager, a fund, or an adviser of any kind.",
      "We do not tell you what to trade, when to trade it, how much to risk, or whether any rule you set is a good idea. Every rule in your charter is a number you chose. Every trade placed on your account is your trade.",
      "We make no representation that using the Service will make you profitable, reduce your losses, improve your results, or help you pass any evaluation or funded-account programme. Nothing on our website, in our emails, or in our marketing is a promise of a result.",
    ],
  },
  {
    id: "no-advice",
    heading: "3. We give no financial advice",
    body: [
      "Nothing we provide is investment advice, financial advice, tax advice, legal advice, or a recommendation to buy or sell anything. We are not a registered investment adviser, research analyst, or portfolio manager, and we are not registered with SEBI or any other financial regulator in any capacity.",
      "Trading leveraged instruments — forex, CFDs, futures, indices, commodities, crypto — carries a high risk of losing money rapidly. Most retail accounts lose money. You can lose more than you deposit. You are responsible for deciding whether trading is appropriate for you, and for taking your own professional advice before you do it.",
    ],
  },
  {
    id: "best-effort",
    heading: "4. Enforcement is best effort, not a guarantee",
    body: [
      "This clause is the most important one in this document. Read it even if you read nothing else.",
      "The Expert Advisor runs inside MetaTrader 5 on a computer — yours or ours — and depends on MetaTrader, your broker's server, your operating system, your internet connection, our servers, and the connection between all of them. Any one of those can fail, lag, disconnect, restart, or behave in a way we did not predict.",
      "When that happens, a rule may not be enforced. A trade you expected to be blocked may be placed. A position you expected to be closed may stay open. A daily lock you expected may not apply. There may be no warning, and you may not find out until afterwards.",
      "In particular, and without limiting the above, the Service cannot and does not guarantee anything about: trades placed from a mobile phone, tablet, web terminal, or any device where our Expert Advisor is not running; trades placed while MetaTrader is closed, your computer is off, or your terminal has no connection; anything your broker does on its own account, including slippage, requotes, spread widening, stop-outs, margin calls, swap charges, or server-side order execution; any period when our servers or the hosted terminal are unavailable; and any rule evaluated against prices, equity or balance figures your broker reported to us incorrectly or late.",
      "You must not treat the Service as a safety net, a risk-management system of record, or a substitute for your own control over your own account. It is an assistant that is wrong sometimes. Trade as though it might not be there, because sometimes it will not be.",
    ],
  },
  {
    id: "your-responsibility",
    heading: "5. Your account, your trades, your mistakes",
    body: [
      "You are solely and entirely responsible for everything that happens on your trading account, including every loss, and including losses that occurred while the Service was running, while it was switched off, while it was malfunctioning, or while it was enforcing a rule you set incorrectly.",
      "We are not responsible for your mistakes. That includes, in full and without exception: rules you set wrongly, in the wrong units, the wrong currency, or the wrong timezone; a daily loss limit set to a figure you did not mean; a session window that lets you trade at a time you intended to be closed; an account you connected that is not the account you meant to connect; the wrong broker server; a charter you never finished writing; a plan you let expire; an Expert Advisor you removed, disabled, failed to install, failed to allow in MetaTrader's WebRequest list, or attached to the wrong chart; manual trades, manual closes, or manual overrides you placed yourself; and any decision you made because of something you saw, or did not see, in our dashboard.",
      "You are responsible for keeping your login credentials secret, for every action taken through your account, and for telling us immediately if you think someone else has access to it.",
      "You are responsible for the accuracy of what you tell us, including your name, phone number, email address and payment details. We send important notices — payment confirmations, plan expiry, enforcement incidents — to the email address on your account. If that address is wrong, abandoned, full, or filtering us as spam, that is your risk, not ours.",
    ],
  },
  {
    id: "prop-firms",
    heading: "6. Prop firms, funded accounts and evaluations",
    body: [
      "Many proprietary trading firms restrict or forbid the use of Expert Advisors, automation, copy trading, or third-party tools. Some forbid them outright. Some require written permission first. Some will void your account, your evaluation, or your payout if they find one.",
      "It is entirely your responsibility to read your firm's rules and obtain whatever permission you need before connecting a funded, challenge or evaluation account to the Service. We do not do this for you and we cannot do it for you.",
      "Our dashboard may show guidance about a firm's policy. That guidance is informational, may be out of date, and is not a legal opinion or a permission. Your firm's current written rules are the only thing that counts.",
      "If your account is restricted, suspended, failed or voided, or a payout is withheld or clawed back, because you used the Service, that is a matter between you and your firm. We accept no liability for it, we will not reimburse you, and we are not obliged to intervene.",
      "Where we offer a hosted terminal, we do not host funded or evaluation accounts, because doing so would require us to hold your broker password and most firms require that you place your own trades. Do not attempt to get around this.",
    ],
  },
  {
    id: "credentials",
    heading: "7. Broker credentials and the hosted terminal",
    body: [
      "If you choose the hosted terminal, you give us your MetaTrader login, password and server so that we can run a terminal on your behalf. We encrypt the password at rest and use it only to connect that terminal.",
      "You confirm that you have the right to give us those credentials and that doing so does not breach your agreement with your broker or your firm. You accept the risk inherent in providing them.",
      "It has to be the trading password, not a read-only investor password: closing a position is the whole point, and a read-only login cannot do it. Do not reuse that password anywhere else — in particular, never give us a password that also opens your broker's client portal, where withdrawals and personal details live. We will never ask you for one.",
      "The hosted terminal runs on shared infrastructure. Several accounts may use the same outbound IP address. If your broker or firm objects to that, the hosted terminal is not for you.",
    ],
  },
  {
    id: "payment",
    heading: "8. Payment, and how our payment process works right now",
    body: [
      "Paid plans are prepaid for a fixed period — one month, three months or twelve months — at the price shown at the time you pay. Prices are charged in Indian rupees.",
      "We do not currently have a card payment gateway. You pay us by UPI or bank transfer, you tell us the transaction reference, and a person at our end matches it against our account by hand and then approves it.",
      "This means access is not instant. Your paid period begins when we approve your payment, not when you send the money. We aim to do this the same day; we do not promise a time, and we are not liable for anything that happens while a payment is being checked.",
      "You must send the exact amount shown and include the reference we give you. A payment without a usable reference, for the wrong amount, or from a source we cannot match may be rejected, and recovering it may take time or may not be possible.",
      "You must not submit a transaction reference that is not yours, that you have already used, or that relates to a payment you did not make. Doing so is fraud, and we will reject the claim, terminate the account, and keep the record.",
      "Plans do not renew automatically. When a period ends, access to paid features stops. It is your job to pay again if you want to continue.",
    ],
  },
  {
    id: "refunds",
    heading: "9. Refunds",
    body: [
      "All payments are final and non-refundable, including part-used periods, including periods you did not use at all, and including periods during which the Service was unavailable, faulty, or failed to enforce a rule.",
      "We do not give refunds because you lost money trading, because a rule was not enforced, because your firm objected to the Expert Advisor, because you changed your mind, because you forgot you had paid, or because you did not get round to using it.",
      "We may, entirely at our discretion and without setting a precedent, refund a duplicate payment, an overpayment, or a payment we were never able to provide any service against. Ask us and we will look at it. The answer may be no.",
      "Do not raise a chargeback, payment dispute or UPI complaint before contacting us. If you do, we may suspend your account while it is open and recover from you any fee the dispute costs us.",
    ],
  },
  {
    id: "availability",
    heading: "10. Availability",
    body: [
      "The Service is provided on an as-is, as-available basis. We offer no uptime commitment, no service level agreement, and no guaranteed response time to support requests, unless we have signed something separate with you that says otherwise.",
      "We may take the Service down for maintenance, change how it works, add features, remove features, or change the limits of a plan, at any time. We will try to give notice of changes that materially reduce what a paid plan does. We are not obliged to keep any particular feature working forever.",
      "We may suspend or terminate your access immediately, without notice and without refund, if you breach these terms, if we reasonably believe you are using the Service fraudulently, abusively or unlawfully, if you attempt to attack or reverse-engineer it, or if your use threatens the stability of the Service for other users.",
    ],
  },
  {
    id: "acceptable-use",
    heading: "11. What you must not do",
    body: [
      "You must not: share, resell, sublicense or redistribute your access, your API key or the Expert Advisor; use one account for more than one person; copy, decompile, reverse-engineer or create derivative works from any part of the Service; scrape it, load-test it, or automate access to it other than through the API as documented; probe or attack our infrastructure or anyone else's through it; interfere with another user's account or data; use the Service to break the law, your broker's agreement, your firm's rules, or exchange rules; or misrepresent what the Service does to anyone else.",
      "You must not use the Service to launder money, to trade on behalf of someone else without the right to do so, or in breach of any sanctions that apply to you.",
    ],
  },
  {
    id: "data",
    heading: "12. Your data",
    body: [
      "We store what we need to run the Service: your name, email address, phone number, timezone, the rules you set, your trades and equity history as reported by your terminal, enforcement events, payment records, and the screenshots and references you send us to prove a payment.",
      "We use it to operate the Service, to support you, to check payments, to prevent fraud and abuse, and to meet our legal obligations. We do not sell it. We share it only with the suppliers we need to run the Service — hosting, database, email delivery — and where the law requires.",
      "You may ask us to delete your account and the data in it. We will do so within a reasonable time, except for records we are required to keep, such as payment records.",
      "You grant us permission to process anonymised, aggregated statistics derived from your use of the Service, including for improving it. Nothing in that identifies you.",
    ],
  },
  {
    id: "ip",
    heading: "13. Our intellectual property",
    body: [
      "The Service, including the Expert Advisor, the dashboard, our name, our marks, and everything we have written, is ours. You get a limited, personal, non-exclusive, non-transferable, revocable licence to use it while your account is in good standing, for your own trading, and for nothing else.",
      "That licence ends the moment your account ends. You must then stop using the Expert Advisor and delete your copies of it.",
    ],
  },
  {
    id: "third-parties",
    heading: "14. Third parties we do not control",
    body: [
      "Your broker, your prop firm, MetaQuotes and MetaTrader, your bank, your UPI app, your internet provider, your device, our hosting providers and our email provider are all third parties. We do not control them, we do not act for them, and we are not responsible for what they do or fail to do.",
      "An outage, error, charge, restriction, price, execution or decision that originates with any of them is not our doing and not our liability.",
    ],
  },
  {
    id: "indemnity",
    heading: "15. You cover us",
    body: [
      "You will indemnify us, our owners, employees and contractors, and hold us harmless, against any claim, demand, loss, liability, fine, cost or expense (including reasonable legal fees) arising from your use of the Service, your trading, your breach of these terms, your breach of your broker's or firm's rules, or any credentials or data you gave us that you did not have the right to give.",
    ],
  },
  {
    id: "liability",
    heading: "16. Limitation of liability",
    body: [
      "To the maximum extent the law allows, we exclude all warranties, conditions and representations not expressly set out in these terms, including any implied warranty of merchantability, fitness for a particular purpose, accuracy, or non-infringement.",
      "To the maximum extent the law allows, we are not liable to you for: any trading loss, lost profit, lost opportunity, missed trade, or forgone gain; any failure, delay or error in enforcing a rule; any loss arising from a rule you set; any loss of data, goodwill or reputation; any indirect, incidental, special, consequential, punitive or exemplary loss; any failed, withheld or clawed-back payout from a funded-account programme; or any loss caused by a third party described in clause 14.",
      "To the maximum extent the law allows, our total aggregate liability to you for all claims arising out of or relating to the Service, however they arise, is limited to the amount you actually paid us in the three months immediately before the event giving rise to the claim — and if you paid us nothing, to nothing.",
      "Nothing in these terms excludes or limits liability that cannot lawfully be excluded or limited, including liability for death or personal injury caused by negligence, for fraud or fraudulent misrepresentation, or any right or remedy you have as a consumer under the Consumer Protection Act 2019 or other applicable Indian law. Where a clause of this agreement is unenforceable against you for that reason, it applies to the fullest extent that is enforceable, and the rest of this agreement is unaffected.",
      "You accept that the price of the Service is set on the basis of these limits, and that we would not offer it at this price without them.",
    ],
  },
  {
    id: "force-majeure",
    heading: "17. Things outside anyone's control",
    body: [
      "We are not liable for any failure or delay caused by something beyond our reasonable control, including internet or power failure, failure of a hosting, cloud or telecom provider, cyber-attack, act of government or regulator, change in law, strike, natural disaster, epidemic, war, or the failure of any exchange, broker, bank or payment network.",
    ],
  },
  {
    id: "changes",
    heading: "18. Changes to these terms",
    body: [
      "We may change these terms. The current version is always on this page with its effective date, and we keep a record of which version you accepted.",
      "If we make a change that materially reduces your rights or materially increases your obligations, we will tell you by email or in the dashboard before it takes effect. Continuing to use the Service after that is your acceptance of the new version. If you do not accept it, stop using the Service and tell us; your current prepaid period will run out under the terms you accepted.",
    ],
  },
  {
    id: "general",
    heading: "19. General",
    body: [
      "These terms, together with anything we link to from them, are the entire agreement between us and replace anything said beforehand.",
      "If any part of these terms is held invalid or unenforceable, that part is limited or removed to the minimum extent necessary and the rest stays in force.",
      "Our failure to enforce any part of these terms at any time is not a waiver of it.",
      "You may not assign or transfer this agreement. We may assign it as part of a merger, acquisition or sale of the business.",
      "We are an independent contractor. Nothing here creates a partnership, employment, agency or joint venture between us.",
      "There are no third-party beneficiaries of this agreement.",
    ],
  },
  {
    id: "law",
    heading: "20. Governing law",
    body: [
      `These terms are governed by the laws of India, and the courts of ${TERMS_SEAT} have exclusive jurisdiction over any dispute arising out of them — except where a law protecting you as a consumer gives you the right to bring a claim somewhere else.`,
      "Before starting a formal claim, you agree to contact us and give us thirty days to try to resolve it.",
    ],
  },
  {
    id: "contact",
    heading: "21. Contact",
    body: [
      `Questions about these terms, or about anything else, go to our contact form on the ${COMPANY} website. That is the fastest way to reach a person.`,
    ],
  },
];

/**
 * The short version, shown beside the checkbox at signup and above the
 * payment disclaimer. These are the clauses a trader would most regret not
 * having read — not a summary of the agreement, and the full text governs.
 */
export const TERMS_HIGHLIGHTS: string[] = [
  "TradeForce is a discipline tool, not a trading system. It does not make you profitable and it gives no financial advice.",
  "Rule enforcement is best effort. It depends on MetaTrader, your broker and your connection, and it can fail without warning — never trade as though it cannot.",
  "Every trade and every loss on your account is yours, including losses that happen because a rule you set was wrong or a rule was not enforced.",
  "Checking your prop firm allows an Expert Advisor is your job, not ours.",
  "Payments are prepaid, approved by hand, and non-refundable.",
];

/**
 * The disclaimer a trader agrees to before telling us they have paid.
 *
 * Separate from TERMS_HIGHLIGHTS because it is about this transfer rather than
 * about the product: there is no gateway between us, so the things that can go
 * wrong with the money are different from the things that can go wrong with
 * the software, and they are the ones a payer needs in front of them at the
 * moment they press the button.
 *
 * Agreement is recorded on the payment row (payments.disclaimer_accepted_at),
 * not on the profile, because each payment is its own transaction.
 */
export const PAYMENT_DISCLAIMER: string[] = [
  "I have actually sent this payment, from an account in my name, for the exact amount shown, with the reference in the note.",
  "The transaction ID I am entering is mine and I have not used it for another payment.",
  "Access begins when TradeForce confirms this payment by hand — not when I send the money — and no time is promised for that.",
  "The payment is non-refundable, including if I stop using TradeForce, if a rule is not enforced, or if my prop firm objects to the Expert Advisor.",
  "Rule enforcement is best effort and can fail. Every trade and every loss on my account is mine.",
];
