Here’s your **MERN + AWS Docker MVP Requirements Template** — fill this in and I can jump straight into writing the source and deployment guide without having to play “mind reader.”

---

## **1. App Overview**

**App Name:**
A web app that Sri Lanka Police Officers can create/manage fines of traffic violation against public licensed drivers.

---

## **2. Core Features (MVP)**

## **Must-have features for launch:**

- **User Roles:** driver, police_officer, admin
- **police_officer** can create traffic violation fine
- **driver** should be able to view his/her fine
- **driver** should be able to do a payment the amount defined in fine
- **admin** can assign the role __police_officer__ to a registered user(manual verification to check user is actually a police officer)
- User shouls be able to view fine with Google Maps location of the fined place in the road may be.

  ***

## **3. Authentication**

- ✅ JWT-based login/logout/register
- ✅ Secure password hashing (bcrypt)
- ✅ Role-based access
- ❌ Email verification & password reset _(Phase 2)_

---

## **4. Data Models**

- **User** → userId (auto-generae GUID), username, email, password, role, createdAt
- **Fine** → driverId, fineAmount, currency, googleLocation,violationId, violationMessage (custom message by officer), createdAt, tags, policeOfficer
- **TrafficViolation** → name, code, fineAmount, currency, severityLevel
- **SeverityLevel** → Enum → Minor, Low, Severe, DeathSevere

---

## **5. UI/UX**

**Overall Style:** _(minimal, modern, playful, dark mode, etc.)_
**Framework:** _(default React + Tailwind CSS unless you want something else)_

---

## **6. Integrations**

-  Stripe for payment

_(Any external services/APIs — e.g., Stripe for payments, Google Maps, OpenAI, etc.)_

---

## **7. Deployment**

**AWS Deployment Target:**

- ECS (more control, scalable)
- Elastic Beanstalk (simpler, managed)

**Database Hosting:**

- MongoDB Atlas (easier, managed)
- Self-hosted MongoDB on AWS EC2 (more work, cheaper long-term)

---

## **8. Extras (Optional)**

- CI/CD via GitHub Actions? ✅
- Admin dashboard? ✅
- API documentation (Swagger/Postman)? ✅

---

If you fill this in, I can:

1. Generate your **full MERN codebase with auth**
2. Create **Docker setup** for local & prod
3. Write the **AWS deployment guide** step-by-step

Do you want me to also give you **a visual architecture diagram** along with the template so you see how all pieces fit together before we start? That way you know exactly what’s happening where.
