# Common Subscription Manager (CSM)

A headless, multi-tenant service that manages who is subscribed to which topics, on which channel, and whether they can be contacted. It sends through [Notify](https://github.com/bcgov/common-notify) but is not part of it.

It does three things for any line-of-business (LOB) app:
1. **Subscribe** people to a topic, with their channel, address and filters, and keep proof that they agreed.
2. **Unsubscribe** them from one topic, or stop everything, in whatever way they choose.
3. **Return the recipients** for a topic when an event happens, leaving out anyone who has opted out.

It also handles the rules that come with them: confirming addresses, SMS opt-out keywords, consent history and audit, and encrypting personal data.

## Glossary

| Term | Meaning |
|---|---|
| **Tenant** | A service that uses CSM, such as a road-conditions service. Each tenant sees only its own topics and subscribers. It's the same tenant as in Notify and CSTAR. |
| **LOB app** | Line-of-business app: the tenant's own application. People subscribe there, and it calls CSM's API. |
| **Topic** | Something people can subscribe to, such as "road closures". Each tenant creates its own. |
| **Channel** | How a message is delivered: email or SMS. |
| **Filter** | A choice that narrows a topic, such as `region = Victoria`. A person can pick several values. A filter they leave empty matches everything. |
| **Contact** | One verified email address or phone number, belonging to one tenant. |
| **Subscription** | One contact signed up to one topic, with their filters. |
| **Double opt-in** | The person must confirm before messages start: by clicking a link (email) or replying `YES` (SMS). It's switched on or off for each channel of a topic, so a topic can confirm SMS but not email. |
| **Pending** | A subscription waiting for confirmation. If it isn't confirmed in time, it expires. |
| **Opt-out / unsubscribe** | The person stops messages from one topic, by link, by the manage page, or by texting a keyword such as `ROADS OFF`. |
| **Keyword** | A short word for a topic, such as `ROADS`. People text `ROADS YES` to confirm and `ROADS OFF` to unsubscribe. Each keyword is unique across CSM. |
| **STOP / START** | Texting `STOP` stops **everything** sent from that phone number, for every tenant using it. `START` undoes it. Carriers require this. |
| **Suppression** | "Don't send to this address", for example after `STOP` or an email that bounced. It pauses messages without deleting subscriptions. |
| **Sender number** | The phone number or short code a text comes from. Notify owns these, and several tenants may share one. |
| **Recipients** | The people a message goes to. Notify asks CSM for them each time it sends (`get_recipients`). Anyone opted out or suppressed is left out. |
| **Consent event** | A permanent record of each time someone subscribed, confirmed, changed filters or opted out, with the wording they were shown. It's the proof of consent. |
| **Manage page** | CSM's web page where a person can see and change their own subscriptions. |

## How subscribing works

**The LOB app owns the subscribe experience; CSM stores and enforces the result.** Only the LOB app knows what its events mean, which filters make sense (a region, a threshold, a stock symbol), and who its user is. It might take the address from the person's sign-in, such as BC Services Card, or ask for it. CSM has no subscribe screen of its own.

1. **Set up the topic:** the LOB app, or a CSM operator, creates the topic in CSM with:
   - its channels (email, SMS), each with its own double opt-in setting and confirmation message;
   - its SMS keyword, such as `ROADS`;
   - optionally, its **filter fields**: the ways people can narrow the topic, such as `region` or `highway`. Fields can be added, changed or removed later. A field added later matches everything for existing subscribers until they choose values.
2. **The person subscribes in the LOB app.** The app calls CSM's `subscribe` with the channel, the address, the chosen filters, and the consent wording the person was shown.
3. **CSM records it.** It finds or creates the contact (the address is encrypted, with a lookup hash), creates the subscription, and saves a consent event as proof.
4. **CSM confirms the address, if the channel requires it (double opt-in).** Each of a topic's channels has its own `confirmationRequired` flag, so a topic can, for example, confirm SMS subscriptions but not email ones. When it's on, the subscription stays `PENDING` and CSM sends a confirmation message through Notify:
   - **Email:** the person clicks the link and presses Confirm on CSM's hosted page.
   - **SMS:** the person replies `YES`, or `<keyword> YES` (e.g. `ROADS YES`). The message can also include the link.

   The subscription then becomes `ACTIVE`. If nobody confirms in time, it becomes `EXPIRED` and nothing is ever sent to it. When the flag is off, the subscription is `ACTIVE` straight away.
5. **From then on, the person receives messages.** When the event happens, Notify asks CSM for the recipients, and this subscription is included if its filters match.

People change their filters, or their address, through the LOB app (which calls CSM's API) or on CSM's "manage subscriptions" page. A new address goes through confirmation again before anything moves to it.

### Subscribing by email

```mermaid
sequenceDiagram
    autonumber
    actor Citizen
    participant LOB as LOB app
    participant CSM
    participant Notify
    participant Provider as Email provider

    Note over LOB,CSM: Set up the topic: its email channel and, optionally, filter fields

    Citizen->>LOB: Choose a topic, filters (e.g. region = Victoria) and an email address
    LOB->>CSM: subscribe(topic, EMAIL, address, filters, consent wording)
    CSM->>CSM: Find or create the contact, create the subscription, record OPT_IN
    CSM-->>LOB: 201, status ACTIVE

    Note over LOB,Provider: Later, when the event happens
    LOB->>Notify: Trigger the event (event type + payload)
    Notify->>CSM: get_recipients(topic, filters, EMAIL)
    CSM-->>Notify: Matching ACTIVE recipients, opted-out excluded, each with an unsubscribe link
    Notify->>Provider: Send
    Provider->>Citizen: The notification, with the unsubscribe link
```

**Double opt-in (optional):** the subscription starts as `PENDING` and CSM emails a confirmation link. The person opens it and presses Confirm, and the subscription becomes `ACTIVE`. Opening the link alone does nothing, because mail scanners open links automatically.

### Subscribing by SMS

```mermaid
sequenceDiagram
    autonumber
    actor Citizen
    participant LOB as LOB app
    participant CSM
    participant Notify
    participant Provider as SMS provider

    Note over LOB,CSM: Set up the topic: its SMS channel (with a keyword, e.g. ROADS) and, optionally, filter fields

    Citizen->>LOB: Choose a topic, filters (e.g. region = Victoria) and a phone number
    LOB->>CSM: subscribe(topic, SMS, phone number, filters, consent wording)
    CSM->>CSM: Find or create the contact, create the subscription, record OPT_IN
    CSM-->>LOB: 201, status ACTIVE

    Note over LOB,Provider: Later, when the event happens
    LOB->>Notify: Trigger the event (event type + payload)
    Notify->>CSM: get_recipients(topic, filters, SMS, sender number)
    CSM-->>Notify: Matching ACTIVE recipients, opted-out and STOPped numbers excluded
    Notify->>Provider: Send from the sender number
    Provider->>Citizen: The notification
```

**Double opt-in (optional):** the subscription starts as `PENDING` and CSM texts "Reply YES to confirm". The reply comes back through Notify, and the subscription becomes `ACTIVE`. If the person has more than one pending subscription on that number, they're asked to reply with the keyword instead, such as `ROADS YES`.

### Subscription states

A subscription moves through these states. A suppression, such as STOP or a hard bounce, doesn't change the state; it only keeps the address out of `get_recipients` until the suppression is lifted.

```mermaid
stateDiagram-v2
    [*] --> PENDING: subscribe (channel requires confirmation)
    [*] --> ACTIVE: subscribe (no confirmation needed)
    PENDING --> ACTIVE: Person confirms (link or SMS YES)
    PENDING --> EXPIRED: Not confirmed in time
    ACTIVE --> UNSUBSCRIBED: Link, keyword, manage page or the LOB app
    UNSUBSCRIBED --> PENDING: Subscribes again (confirmation required)
    UNSUBSCRIBED --> ACTIVE: Subscribes again (no confirmation needed)
    EXPIRED --> PENDING: Subscribes again
```

## Ways to opt out

A subscriber can stop messages in several ways. Only a plain **STOP** applies to everything; every other way applies to **one topic**.

| Action | Channel | Scope | Handled by |
|---|---|---|---|
| Reply `STOP` | SMS | Every topic sent from that number, across all tenants on a shared number | The SMS provider blocks the number itself; CSM records it so `get_recipients` stays in step |
| Reply a topic keyword, e.g. `ROADS OFF` | SMS | That topic only | CSM |
| Tap the short link in the text | SMS | That topic only | CSM (hosted page) |
| Click the unsubscribe link, or the mail client's one-click unsubscribe | Email | That topic only | CSM (hosted page or one-click endpoint) |
| Use the "manage subscriptions" page | Email or SMS | Any of the person's topics, chosen by them | CSM (hosted page) |
| Reply `START` | SMS | Undoes `STOP`: the number is unblocked and the person's topic subscriptions resume as they were | The SMS provider and CSM |

Notes:
- Carriers require `STOP` to stop everything from a number, and providers enforce it before any of our code runs. We can't make it apply to one topic.  We can, however, send one more notification after a stop request, and this can include a description of what STOP does, how to START again, or perhaps ultimately a link that takes citizens to CSM's notification management screen (TBD).
- `STOP` pauses delivery; it doesn't delete subscriptions. That's what lets `START` restore them.
- Topic keywords are unique for each sender number. They must not use any provider's reserved opt-out words, such as `STOP`, `END`, `CANCEL`, `QUIT` or `UNSUBSCRIBE`.  Can be managed in AWS.
- CSM hosts the unsubscribe and manage pages. Each topic can instead redirect to its own page after the change is made.
- Notify owns the phone numbers and receives every inbound text from the provider. It forwards them to CSM as webhooks, and CSM never connects to an SMS provider directly.

```mermaid
flowchart LR
    subgraph SMS["SMS replies"]
        stop["Reply STOP"]
        kw["Reply topic keyword<br/>e.g. ROADS OFF"]
        start["Reply START"]
    end

    subgraph Links["Links hosted by CSM"]
        smslink["Short link in the SMS"]
        emaillink["Unsubscribe link in the email"]
        oneclick["One-click unsubscribe<br/>from the mail client"]
        manage["Manage subscriptions page"]
    end

    provider["SMS provider<br/>blocks or unblocks the number<br/>itself on STOP and START"]
    notify["Notify<br/>receives the inbound SMS<br/>and sends an sms.inbound webhook"]
    csm(["CSM"])

    stop --> provider
    kw --> provider
    start --> provider
    provider --> notify --> csm

    smslink --> csm
    emaillink --> csm
    oneclick --> csm
    manage --> csm

    csm -->|STOP| allOff["Suppress the phone number<br/>for that sender number<br/>All topics on it paused"]
    csm -->|"Keyword or link"| oneOff["Unsubscribe from<br/>that topic only"]
    csm -->|START| resume["Lift the suppression<br/>Topic subscriptions resume"]
```

## Email unsubscribe

Every email sent to subscribers carries a way out. The service supports two ways, so it works whatever Notify can put into a template:

- **Link for each recipient (preferred):** `get_recipients` returns a signed `unsubscribeUrl` with each recipient. Notify puts it in the email body and in the `List-Unsubscribe` headers, so the person unsubscribes in one click.
- **Link for each topic (fallback):** a fixed "manage subscriptions" link in the template. The person enters their email address and gets a sign-in link to manage their subscriptions. It takes two steps, but Notify only needs fixed text.

Either way, the person is unsubscribed from **that topic only**, and the next `get_recipients` call leaves them out.

```mermaid
sequenceDiagram
    autonumber
    actor Citizen
    participant LOB as Line-of-business app
    participant Notify
    participant CSM

    LOB->>Notify: Trigger event (event type + payload)
    Notify->>CSM: get_recipients(topic, filters, channel = email)
    CSM-->>Notify: Active recipients, opted-out excluded, each with an unsubscribeUrl

    alt Link for each recipient (preferred)
        Notify->>Citizen: Email with unsubscribeUrl in the body and List-Unsubscribe headers
        Citizen->>CSM: Click link, or mail client sends a one-click POST
        CSM->>CSM: Validate the signed token, mark the subscription UNSUBSCRIBED, record the audit event
        CSM-->>Citizen: Confirmation page, or redirect to the topic's own page
    else Link for each topic (fallback)
        Notify->>Citizen: Email with a fixed "manage subscriptions" link for the topic
        Citizen->>CSM: Open the manage page and enter an email address
        CSM->>Notify: Send a sign-in link to that address
        Notify->>Citizen: Email with the sign-in link
        Citizen->>CSM: Click the sign-in link and unsubscribe from the topic
        CSM->>CSM: Mark the subscription UNSUBSCRIBED and record the audit event
    end

    Note over Notify,CSM: On the next send, get_recipients no longer returns this person for this topic
```

## SMS unsubscribe

A person can stop texts in three ways. The first two stop **one topic**; `STOP` stops **everything** from that sender number.

- **Reply the topic keyword with `OFF`**, such as `ROADS OFF`. CSM unsubscribes them from that topic and replies to confirm.
- **Tap the unsubscribe link** in the text. `get_recipients` returns a signed `unsubscribeUrl` for SMS recipients too, and it opens CSM's hosted page.
- **Reply `STOP`.** The SMS provider blocks the number itself and sends its own reply. CSM adds a suppression, so `get_recipients` leaves the number out for every topic and tenant on that sender number. Subscriptions aren't changed, so `START` brings them all back.

```mermaid
sequenceDiagram
    autonumber
    actor Citizen
    participant Provider as SMS provider
    participant Notify
    participant CSM

    Notify->>CSM: get_recipients(topic, filters, SMS, sender number)
    CSM-->>Notify: Active recipients, opted-out excluded, each with an unsubscribeUrl
    Notify->>Provider: Send from the sender number
    Provider->>Citizen: The notification, e.g. "Reply ROADS OFF to stop road closure alerts"

    alt Topic keyword (one topic)
        Citizen->>Provider: ROADS OFF
        Provider->>Notify: Inbound text
        Notify->>CSM: sms.inbound webhook
        CSM->>CSM: Mark the subscription UNSUBSCRIBED, record OPT_OUT
        CSM->>Notify: Send the reply "You won't get road closure alerts any more"
        Notify->>Provider: Send
        Provider->>Citizen: The reply
    else Link in the text (one topic)
        Citizen->>CSM: Open the link, then press Unsubscribe on the hosted page
        CSM->>CSM: Validate the signed token, mark the subscription UNSUBSCRIBED, record OPT_OUT
        CSM-->>Citizen: Confirmation page, or redirect to the topic's own page
    else STOP (everything from this sender number)
        Citizen->>Provider: STOP
        Provider->>Provider: Block the number for this sender number
        Provider->>Citizen: The provider's own opt-out reply
        Provider->>Notify: Inbound text
        Notify->>CSM: sms.inbound webhook
        CSM->>CSM: Add a suppression for this number and sender number (subscriptions unchanged)
    end

    Note over Notify,CSM: On the next send, get_recipients leaves this person out: for that topic, or for every topic on the sender number after STOP

    opt Later, the person replies START
        Citizen->>Provider: START
        Provider->>Provider: Unblock the number
        Provider->>Notify: Inbound text
        Notify->>CSM: sms.inbound webhook
        CSM->>CSM: Lift the suppression. Their subscriptions resume as they were
    end
```

## Integration and authentication

Services call CSM the same way they call Notify: **through Kong (the API gateway), with an API key from the API Services Portal**. Kong checks the key and applies rate limits. It then tells CSM which credential was used, and CSM maps that credential to a tenant. Only the public links skip API keys, because the token in the link is the permission.

| Caller | Route | How it authenticates | What it can do |
|---|---|---|---|
| **Tenant app** (a line-of-business service) | Kong | Its API key, in the `X-API-KEY` header | Manage its own topics, subscribers and suppressions. Every call is limited to that tenant's data. |
| **Notify**: recipient queries | Kong | **Notify's own API key**, separate from every tenant's | Query recipients for any tenant, naming the tenant in each request. Notify never borrows a tenant's key. |
| **Notify**: inbound SMS and delivery webhooks | Kong | The same Notify key, **plus** an HMAC signature on the body | Report STOP/START, keyword replies, bounces and complaints. The signature proves the body wasn't altered. |
| **CSM → Notify** (confirmations, keyword replies, sign-in links) | Notify's Kong route | CSM's own Notify API key | Send messages. CSM is just another Notify client. |
| **The public** (links in emails and texts, mail clients' one-click unsubscribe) | A public CSM hostname, rate-limited | No key: the signed token in the link | Confirm, unsubscribe or manage that person's own subscriptions. |
| **CSM operators** | Kong | Keycloak sign-in | Set up tenants and map API keys to them. |

```mermaid
flowchart LR
    lob["Tenant app"]
    notify["Notify"]
    citizen["Citizen or mail client"]
    op["CSM operator"]

    subgraph Gateway["Kong (API gateway)"]
        kong["Checks the API key or sign-in<br/>Rate limits<br/>Passes the credential identity on"]
    end

    csm(["CSM<br/>maps the credential to a tenant<br/>or to Notify"])
    pub["Public CSM hostname<br/>rate-limited"]
    notifyApi["Notify API<br/>(Notify's Kong route)"]

    lob -->|"Tenant API key"| kong
    notify -->|"Notify API key<br/>+ HMAC on webhooks"| kong
    op -->|"Keycloak"| kong
    kong --> csm

    citizen -->|"Signed link token"| pub --> csm

    csm -->|"CSM's Notify API key"| notifyApi
```

Notes:
- **Calls go through Kong, even from Notify.** Notify and CSM run in different OpenShift namespaces. Calling CSM directly would need cross-namespace network rules and a second authentication method, and would bypass Kong's rate limits and logs. Recipients come back up to 1,000 at a time, so even a large send needs only a few gateway calls.
- **CSM trusts the identity headers only from Kong.** A network policy stops anything except the Kong gateway, and the route for public links, from reaching the backend.
- **Mapping keys to tenants:** in the MVP a CSM operator does this through the admin API. Tenants will do it themselves in phase 2.
- **Notify calls the REST API directly.** The MCP tools are for other services and AI agents that discover tools at runtime. They sit behind Kong and use the same keys.

Still to decide:
- **Whose name confirmations are sent under.** Either **(A)** CSM sends as itself, with one sender for every tenant, or **(B)** CSM sends on behalf of the tenant, using the tenant's own Notify templates, sender and usage limits. B is recommended, because it's what citizens expect and it keeps each tenant's usage accurate. It needs a trusted "send on behalf of" capability in Notify.
- **Whether the API Services Portal can issue one key that works for both Notify and CSM**, which would make onboarding simpler. To be checked with the API Services Portal team.

## Design

- [Data model (draft)](docs/data-model.md)
- [API specification (draft, OpenAPI 3.1)](docs/openapi.yaml)
