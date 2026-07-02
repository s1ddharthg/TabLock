# Privacy Policy for TabLocker

**Last Updated: July 2, 2026**

TabLocker (the "Extension") is committed to protecting your privacy. This Privacy Policy describes how we handle information when you install and use the Extension.

---

## 1. No Collection or Transmission of Personal Data
We do not collect, store, track, sell, or transmit any of your personal data, browser history, or activities. 
- **No Personal Information:** We do not collect names, email addresses, phone numbers, or any other personally identifiable information (PII).
- **No Browsing History:** We do not track, collect, or transmit the websites you visit or the tabs you open.
- **No Password Collection:** Your master password is never stored in plain text and is never transmitted off your device.

---

## 2. Local Storage of Data
All data required for the Extension to function is stored strictly locally on your device within the browser's secure sandboxed storage (`chrome.storage.local`). This includes:
- **Master Password:** Stored locally as a secure salted hash (generated using PBKDF2 with SHA-256).
- **Locked URLs:** The list of website URLs you have configured to lock.
- **Current Session State:** A temporary list of URLs unlocked during your current browser session.

None of this data is sent to external servers or accessible by third parties.

---

## 3. Third-Party Services and Analytics
The Extension does not use third-party analytics (like Google Analytics), remote libraries, external tracking scripts, or ad networks. It is entirely self-contained.

---

## 4. Compliance with Google Developer Program Policies
The Extension complies fully with the Chrome Web Store Developer Program Policies, including the **Limited Use Policy**:
- We do not sell user data.
- We do not use or transfer user data for personalized advertising.
- We do not use user data to determine creditworthiness or for lending purposes.

---

## 5. Changes to This Privacy Policy
We may update our Privacy Policy from time to time. Any changes will be posted by updating this document in the Extension's repository.

---

## 6. Contact Us
If you have any questions or feedback about this Privacy Policy, please contact us by opening an issue on our GitHub repository.
