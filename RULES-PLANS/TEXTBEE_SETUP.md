# textbee SMS setup

PECTRACK texts two things:
- the 6-digit code that proves a phone number at customer sign-up and in Reserve;
- the order number of a reservation.

The texts go through **textbee.dev**. textbee sends each one from an Android phone the team keeps on, using that phone's SIM. The free plan covers 1 phone, 50 texts a day and 300 a month. The only cost is the SIM's load.

## What you need

- An Android phone. An iPhone will not work. A spare phone is best, because it has to stay on.
- A prepaid SIM with load. An unli-text promo from the SIM's network makes the texts nearly free. Check that the promo covers texts to all networks, or to the networks your customers use.
- Internet on that phone (Wi-Fi or mobile data). textbee hands each text to the phone over the internet.

## 1. Account and app

1. Go to **textbee.dev** and sign up. Use the team's shared Gmail, not a personal one.
2. In the dashboard, find **Download app** (or the Android app link) and install it on the phone. It may come as an APK. If it does, Android asks you to allow installing from this source; allow it for that one install.
3. Open the app and give it permission to **send SMS** (and to read the phone state, if it asks).

## 2. Link the phone

1. In the dashboard, create an **API key**. It shows the key and a QR code.
   - **Copy the key now and keep it somewhere private.** It is shown once, and anyone holding it can send texts from your SIM.
2. In the app, scan the QR code, or paste the key. The phone now appears under **Devices** in the dashboard.
3. Turn the gateway **on** in the app, if it has a switch.
4. In the dashboard, open the phone under **Devices** and copy its **device ID**, a long string of letters and numbers.

The menu names above may differ a little from what you see. What you need at the end is **one API key and one device ID**.

## 3. Keep the phone sending

Android pauses apps in the background to save battery. That is the most common reason a text arrives late or not at all.

- Settings, then Apps, then textbee, then **Battery: Unrestricted** (or "Don't optimise").
- Keep the phone **charging** and on Wi-Fi at the counter.
- Do not swipe the app away from recent apps.
- On a dual-SIM phone, the app picks the SIM. Make sure it uses the one with the promo.

## 4. Try it on your computer first

1. Add these lines to `.env`, with your own values:

   ```
   TEXTBEE_API_KEY=your-api-key
   TEXTBEE_DEVICE_ID=your-device-id
   ```

2. Send yourself a check text:

   ```
   node scripts/send-sms-check.mjs 09XXXXXXXXX
   ```

   It prints `Provider: textbee` and `Sent to …`. The text comes from the phone's number within a minute.

3. Restart `npm run dev` and try it in the app:
   - sign up a test customer with your own number;
   - take a reservation in Walk-in, then Reserve.

## 5. Turn it on in the live site

1. Railway, then the PECTRACK service, then **Variables**. Add `TEXTBEE_API_KEY` and `TEXTBEE_DEVICE_ID`, with the same values.
2. Railway redeploys. From then on, the live sign-up and Reserve ask for the texted code.

## If the phone is down

**Every sign-up and every reservation needs the code once textbee is set.** If the phone is off or out of load, nobody can finish either one. Do one of these:

- Fix the phone (charge it, load it, reconnect it). The codes work again at once.
- Or, in Railway, add `SMS_VERIFY_PHONES=off`. The code step disappears, and sign-up and Reserve work without it. Remove the variable when the phone is back.

A reservation's order-number text failing never stops the reservation. Its email still goes out.

## Limits to remember

- The free plan sends **50 texts a day and 300 a month**. One sign-up uses 1 text, and one reservation uses 2 (the code and the order number).
- Texts come from the phone's own number, not from a "PECTRACK" sender name.
- A paid gateway (Semaphore) is still built in, for when the bakery outgrows this. Set `SEMAPHORE_API_KEY` instead, and remove the textbee variables.

**Never commit the API key to git and never paste it in chat.** It lives only in `.env` and in Railway's Variables.

## Until textbee is set up: test mode

While no SMS service is set (no `TEXTBEE_API_KEY` / `SEMAPHORE_API_KEY`), the phone codes run in **test mode**, both locally and on the live site:
- pressing **Text me a code** / **Send code** shows "Test mode — no SMS is sent yet. The code for 09… is 123456";
- the code box is already filled in, so you press **Verify** and carry on.

Sign-up and Advanced order then work end to end without texting anything. Test mode switches itself off the moment a provider is added, and real codes are then only ever texted. To turn the code step off entirely instead, set `SMS_VERIFY_PHONES=off`. To keep the step but hide the code (it goes to the server log), set `SMS_TEST_MODE=off`.
