# FleetBridge Discovery 1.1.1

An offline-first Chrome Manifest V3 extension with two distinct, explicit workflows:

1. On a Google Search results tab, click **Capture this Google page**, or intentionally start a bounded 5/10/20-page Google run. The Google collector follows the actual visible **Next** link approximately every 30 seconds, stops on the last page, a verification challenge or changed tab, and deduplicates profile URLs in IndexedDB.
2. Open **Candidate review sidebar** on the right of Chrome. Click **Open profile on left** to open one queued LinkedIn `/in/` profile in the main browser tab. Take as long as desired, including manually scrolling and expanding the Experience section. Click **Capture visible profile / capture again** to read the currently rendered professional content. Another capture can replace an *unedited* experience excerpt when more of it becomes visible, without overwriting corrections you made yourself. Correct the four fields (**Name**, **Headline**, **Location**, **Experience**), review the experience calculations, then click **Save only** or **Save & open next**. The queue and 10-second visual timer do not advance by themselves.

## Experience calculations

- **Total work experience:** add the dated work periods found in Experience, merging any overlapping or touching calendar months to avoid counting concurrent roles twice.
- **Latest employer:** employer immediately before the date range for the role with the most recent end date (or present for a current role). Company detection is heuristic; review it before using it for recruitment.
- **Latest role duration:** duration of that most recent dated role, shown in years and months and as a decimal years count. This is different from total experience.
- English and French month names, abbreviated months, present/current and `aujourd'hui` are accepted. A bare `2019 - 2021` is approximated as January 2019 through December 2021 and explicitly marked **approximate**. Missing dates remain **Unknown**; we never invent work history.
- The profile header parser recognizes French regional location descriptions such as `Montréal et périphérie · Coordonnées`, saving only `Montréal et périphérie` as Location. The Headline editor expands to multiple lines so the full headline is visible.
- The three derived values refresh when you edit Experience. After you click Save, they are stored under `profileImport.experienceSummary`, displayed on the database dashboard and exported as dedicated CSV columns. Existing Google findings, recruiter status, notes and old imported fields remain in storage. Older imports are calculated on CSV export without requiring reimport.

## Install safely without losing your existing profiles

1. **Back up first:** if your previous FleetBridge dashboard still works, click its **Export JSON** button and keep the downloaded file.
2. **If preserving an existing extension's database**, replace the files *inside the exact same unpacked extension directory* with the files from this ZIP's `technician-search-collector/` directory, then visit `chrome://extensions` and click **Reload** on that existing extension. Do not click Remove; do not load an unrelated new extension folder. Chrome identifies unpacked extensions by their location/ID, and a different extension ID has a separate IndexedDB database.
3. If installing fresh, unzip, visit `chrome://extensions`, enable Developer mode, **Load unpacked**, and select the extracted `technician-search-collector` directory.
4. To recover data in a new extension install, open **Candidate database** and click **Restore JSON backup**. Previous FleetBridge JSON backup arrays are supported. Rebuilding a queue does not delete profiles.
5. If the sidebar opens on the left, adjust its placement in Chrome's sidebar settings; Chrome controls side panel placement.

## Data, privacy and limitations

- Existing IndexedDB stays named `fleetbridge-search-collector`; object store `profiles`, key `url`. Chrome extension local data is not equivalent to cloud backup.
- LinkedIn page access is optional and requested only when you click **Capture visible profile**. Only current visible/rendered profile DOM content is read. No LinkedIn API calls, automated scrolling, login bypass, background harvesting, messaging or automatic next-profile capture.
- LinkedIn's terms can restrict third-party extraction, including browser extensions, even when manually triggered. Use only with an account and content you're permitted to process. Account restrictions are possible.
- LinkedIn's markup changes; extraction may return missing sections or low confidence. You must inspect and edit results; text in collapsed content may not be available. It intentionally avoids interpreting navigation and Premium/chat suggestions as candidate details.
- Version 1.1.0 keeps the improved profile-column and LinkedIn Experience card detection, including zero-height anchors. Only the four requested professional fields are extracted. If the Experience heading has no visible card anchor, a **dated** Experience text block in the main profile column can be parsed even when it is the only professional section. Navigation, Premium and chat prompts are excluded. When the identity comes only from a browser title, confirm the name before saving. Low-confidence saving asks for confirmation.
- If the experience timeline is incomplete, **scroll the main LinkedIn profile**, expand Experience, and click Capture again. You can also manually correct the experience field. No extractor can recover positions LinkedIn has not rendered, and site layout changes may require further updates. Experience totals are professional-history estimates, not verified legal employment dates.
- Google estimates such as “5,620 results” are **not** 5,620 retrievable results. Google may cap accessible pages, show repeated results or issue verification challenges. No attempt is made to bypass those restrictions.
- No age prediction or collection of private contact details. CSV data is spreadsheet-formula escaped, URLs are deduplicated, and extracted emails/phone numbers are redacted. Use professional data with a valid legal basis, limited retention and human review before recruiting decisions.
- CSV can be opened in Excel or manually imported into Google Sheets. No Google account/API/sync is needed.

## Files

`manifest.json` Chrome permissions; `background.js` bounded Google collection; `google_capture.js` visible search results; `profile_capture.js` four-field visible professional profile extraction; `experience_metrics.js` work-history calculations; `core.js` schema/export; `db.js` IndexedDB; `popup.html/js` Google controls; `panel.html/js` recruiter sidebar; `dashboard.html/js` local review/export.

## Developer checks

Run `node --test tests/*.test.cjs` from the extension directory. Tests cover zero-height Experience anchors, fake messaging content, visible-text Experience fallback, preservation of manual corrections, French/English date parsing, overlapping jobs, most recent employer, and CSV backfill. Chrome runtime/permissions and real LinkedIn page markup still require browser testing.
