import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { env } from "../config/env";
import { Article } from "../models/article.model";
import { Contract } from "../models/contract.model";
import { FaultContact } from "../models/faultContact.model";
import { Permit } from "../models/permit.model";
import { Hotel } from "../models/hotel.model";
import { Supplier } from "../models/supplier.model";
import { Vacancy } from "../models/vacancy.model";
import { Voucher } from "../models/voucher.model";
import { nextMemberNumber } from "../utils/memberNumber";
import { slugify } from "../utils/slugify";

/**
 * Local development only: demo hotels, suppliers, jobs, vouchers and stories
 * so the public website shows real API data before the client's content
 * arrives. Safe to run twice (existing slugs are skipped).
 *
 *   npm run seed:demo
 *
 * Every email address uses the reserved ".test" domain, which sendEmail()
 * never delivers.
 */

const photo = (id: string, w = 1600) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

const HOTELS = [
  {
    name: "Hotel De Gracht",
    city: "Amsterdam",
    region: "North Holland",
    address: "Herengracht 120, Amsterdam",
    description:
      "Eighteen rooms in a 17th-century canal house, with breakfast from local bakers and views over the water.",
    image: photo("1611892440504-42a792e24d32"),
    offer: "15% off midweek",
    featured: true,
  },
  {
    name: "Het Pakhuis Hotel",
    city: "Utrecht",
    region: "Utrecht",
    address: "Oudegracht 45, Utrecht",
    description:
      "A former warehouse on the wharf, now a characterful boutique hotel with its own bar and restaurant.",
    image: photo("1631049307264-da0ec9d70304", 1200),
    featured: true,
  },
  {
    name: "Boetiekhotel Maasoever",
    city: "Maastricht",
    region: "Limburg",
    address: "Maasboulevard 8, Maastricht",
    description:
      "Peace and quiet, rich Burgundian cuisine and rooms overlooking the Maas, a short walk from the Vrijthof.",
    image: photo("1590490360182-c33d57733427", 1200),
    offer: "Free late check-out",
    featured: true,
  },
  {
    name: "Duinhuys Noordwijk",
    city: "Noordwijk",
    region: "South Holland",
    address: "Koningin Wilhelmina Boulevard 3, Noordwijk",
    description: "Twelve sea-view rooms behind the dunes, with bikes, a sauna and long breakfasts.",
    image: photo("1582719478250-c89cae4dc85b", 1200),
  },
  {
    name: "Stadslogement Zwolle",
    city: "Zwolle",
    region: "Overijssel",
    address: "Melkmarkt 21, Zwolle",
    description: "Small and personal, inside the old city walls, with a courtyard garden and honesty bar.",
    image: photo("1578683010236-d716f9a3f461", 1200),
    offer: "10% off stays of 3 nights",
  },
  {
    name: "Hotel Veerhuis",
    city: "Middelburg",
    region: "Zeeland",
    address: "Rouaansekaai 9, Middelburg",
    description: "A ferry house from 1880, restored with care: nine rooms, a wine cellar and a harbour terrace.",
    image: photo("1618773928121-c32242e63f39", 1200),
  },
];

const SUPPLIERS = [
  {
    name: "Linnen & Co",
    tagline: "Hotel linen to rent or buy, freshly washed every week and always delivered on time.",
    description:
      "Linnen & Co supplies bed and bath linen to boutique hotels across the Randstad. Rent or buy, with weekly pick-up and delivery, and spare stock during high season.",
    categories: ["Linen & textiles", "Laundry"],
    regions: ["North Holland", "Utrecht"],
    image: photo("1505693416388-ac5ce068fe85", 1200),
    featured: true,
    showInPurchasing: true,
  },
  {
    name: "Technisch Beheer West",
    tagline: "Maintenance and a 24/7 repair service for installations, lifts and fire alarm systems.",
    description:
      "One contact for all technical installations: heating, ventilation, lifts, fire alarm systems and NEN 3140 inspections. 24/7 emergency service in the western Netherlands.",
    categories: ["Technical maintenance", "Fire safety"],
    regions: ["South Holland", "North Holland"],
    image: photo("1584622650111-993a426fbf0a", 1200),
    featured: true,
  },
  {
    name: "Smaakmakers Food Supply",
    tagline: "Fresh produce from local farmers for breakfast and the restaurant, delivered daily.",
    description:
      "Daily fresh deliveries for hotel breakfast and restaurant kitchens: bread, dairy, vegetables and meat from regional producers, HACCP-compliant.",
    categories: ["F&B", "Wholesale"],
    regions: ["All of the Netherlands"],
    image: photo("1551218808-94e220e084d2", 1200),
    featured: true,
    showInPurchasing: true,
  },
  {
    name: "GroenStroom Zakelijk",
    tagline: "Green energy contracts for small hotels, with group deals through HotelConnect.",
    description:
      "Energy supplier for small businesses. Fixed or variable contracts for green power and gas, and the partner for the HotelConnect group purchase.",
    categories: ["Energy"],
    regions: ["All of the Netherlands"],
    showInPurchasing: true,
  },
  {
    name: "Schoon & Fris Hospitality",
    tagline: "Room cleaning and deep cleans by trained hospitality crews.",
    description:
      "Housekeeping support during peaks, periodic deep cleans and window cleaning. Our crews are trained for hotels and work with your own checklists.",
    categories: ["Cleaning", "Staffing"],
    regions: ["Utrecht", "Gelderland", "North Brabant"],
  },
  {
    name: "Brandwacht Nederland",
    tagline: "Fire extinguisher checks, evacuation plans and BHV training on site.",
    description:
      "Yearly fire extinguisher inspections, emergency lighting checks, evacuation plans and BHV courses for hotel staff, all documented for your permit.",
    categories: ["Fire safety", "Security"],
    regions: ["All of the Netherlands"],
    showInPurchasing: true,
  },
  {
    name: "Hotelamenities.nl",
    tagline: "Sustainable bathroom amenities and refill systems with your own logo.",
    description:
      "Refillable soap and shampoo dispensers, slippers, dental kits and more — sustainably made and, from 500 pieces, printed with your hotel's logo.",
    categories: ["Amenities", "Wholesale"],
    regions: ["All of the Netherlands"],
    showInPurchasing: true,
  },
  {
    name: "PMS Partners",
    tagline: "Hotel software set up and supported by people who know small hotels.",
    description:
      "Implementation and support of property management, channel managers and booking engines, with a Dutch helpdesk that knows how a small hotel works.",
    categories: ["IT & software"],
    regions: ["All of the Netherlands"],
  },
];

// [title, hotel index, category, employment type, urgent, description]
const VACANCIES: [string, number, string, string, boolean, string][] = [
  ["Independent cook", 0, "Kitchen", "Full-time", true, "Cook breakfast and dinner for our 18 rooms and the canal-side terrace. You work with fresh, local produce and have room for your own ideas."],
  ["Receptionist, evening shift", 1, "Front Office", "Part-time", true, "Welcome guests, handle check-ins and look after the bar in the evening. Dutch and English required, German is a plus."],
  ["All-round maintenance technician", 2, "Technical", "Full-time", true, "Keep our monumental building running: small repairs, installations, contact with suppliers and the yearly inspections."],
  ["Housekeeper", 3, "Housekeeping", "Part-time", false, "Make our sea-view rooms shine. Flexible hours, mostly mornings, with a fixed team."],
  ["Breakfast host", 4, "F&B Service", "On call", false, "Serve our long breakfasts at the weekend and on holidays. Ideal next to your studies."],
  ["Assistant hotel manager", 5, "Management", "Full-time", false, "Run the daily operation together with the owners: staff planning, revenue, guest contact and suppliers."],
  ["Sous chef", 1, "Kitchen", "Full-time", false, "Lead the kitchen when the chef is off and help write the seasonal menu for our restaurant."],
  ["Front office intern", 0, "Front Office", "Internship", false, "A 5-month hospitality internship at the front desk of a small canal-house hotel."],
];

// [title, hotel index, category, discount %, teaser]
const VOUCHERS: [string, number, string, number, string][] = [
  ["Meeting day package", 1, "Meeting", 20, "Meeting room for 12, lunch and unlimited coffee in a former warehouse."],
  ["Business stay midweek", 0, "Stay", 15, "Two nights on the canal including breakfast and late check-out."],
  ["Team dinner on the Maas", 2, "Dining", 10, "A four-course Burgundian dinner for groups of up to 20."],
  ["Sea-view gift night", 3, "Gift", 25, "A night with breakfast and sauna as a gift for clients or staff."],
  ["Board meeting by the harbour", 5, "Meeting", 15, "A private room with harbour view, lunch and drinks for up to 8."],
  ["City break voucher", 4, "Gift", 20, "One night inside the city walls with a welcome drink."],
];

const ARTICLES = [
  {
    title: "How to keep a small hotel compliant without a full-time office manager",
    kind: "Interview",
    excerpt: "A hotel manager from Haarlem on permits, contracts and the reminder that saved her from a fine.",
    image: photo("1625244724120-1fd1d34d00f6", 1200),
    readingMinutes: 6,
  },
  {
    title: "Buying energy together: why ten hotels are stronger than one",
    kind: "Article",
    excerpt: "What group purchasing delivers, how it works and why the deadline matters.",
    image: photo("1559329007-40df8a9345d8", 1200),
    readingMinutes: 4,
  },
  {
    title: "Finding staff in 2026: stop using long application forms",
    kind: "Column",
    excerpt: "Applicants drop out after three fields. A case for 1-click applications via WhatsApp.",
    image: photo("1517248135467-4c7edcad34c4", 1200),
    readingMinutes: 3,
  },
];

const DEMO_BODY = `<p><em>Demo text — the real article will be delivered by HotelConnect.</em></p>
<p>Small hotels do everything themselves: permits, contracts, staff and suppliers. In this piece we look at what works in practice, and where a little automation saves hours every month.</p>
<h2>What we learned</h2>
<p>Keep one overview of every contract and permit, with the end date and the notice period. Let reminders do the remembering, thirty days before anything expires.</p>
<p>And talk to other hoteliers: most problems have been solved before, often just around the corner.</p>`;

async function run() {
  if (env.isProduction) {
    console.error("seed:demo is for local development only.");
    process.exit(1);
  }
  await connectDB();

  const hotels = [];
  for (const data of HOTELS) {
    const slug = slugify(data.name);
    let hotel = await Hotel.findOne({ slug });
    if (!hotel) {
      hotel = await Hotel.create({
        ...data,
        slug,
        memberNumber: await nextMemberNumber("hotel"),
        bookingUrl: "https://example.com/book",
        emails: { general: `info@${slug}.test`, vacancies: `jobs@${slug}.test` },
      });
      console.log(`hotel     ${hotel.memberNumber} ${hotel.name}`);
    }
    hotels.push(hotel);
  }

  for (const data of SUPPLIERS) {
    const slug = slugify(data.name);
    if (await Supplier.exists({ slug })) continue;
    const supplier = await Supplier.create({
      ...data,
      slug,
      memberNumber: await nextMemberNumber("supplier"),
      website: "https://example.com",
      contact: { email: `contact@${slug}.test` },
    });
    console.log(`supplier  ${supplier.memberNumber} ${supplier.name}`);
  }

  for (const [index, [title, hotelIndex, category, employmentType, urgent, description]] of VACANCIES.entries()) {
    const hotel = hotels[hotelIndex];
    const slug = slugify(`${title} ${hotel.name}`);
    if (await Vacancy.exists({ slug })) continue;
    await Vacancy.create({
      hotel: hotel._id,
      title,
      slug,
      description,
      category,
      employmentType,
      city: hotel.city,
      region: hotel.region,
      urgent,
      status: "published",
      applyEmail: hotel.emails.vacancies || hotel.emails.general,
      applyWhatsapp: "31600000000",
      publishedAt: new Date(Date.now() - index * 26 * 60 * 60 * 1000),
    });
    console.log(`vacancy   ${title} @ ${hotel.name}`);
  }

  if ((await Voucher.countDocuments()) === 0) {
    for (const [index, [title, hotelIndex, category, discountPercent, teaser]] of VOUCHERS.entries()) {
      const hotel = hotels[hotelIndex];
      await Voucher.create({
        hotel: hotel._id,
        title,
        teaser,
        description: `${teaser} Book through the hotel's own booking page with your HotelConnect member number.`,
        image: hotel.image,
        discountPercent,
        category,
        region: hotel.region,
        bookingUrl: "https://example.com/book",
        // The first one is a paid promotion, shown first in the slideshow.
        promotedUntil: index === 0 ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
      });
      console.log(`voucher   ${title}`);
    }
  }

  for (const [index, data] of ARTICLES.entries()) {
    const slug = slugify(data.title);
    if (await Article.exists({ slug })) continue;
    await Article.create({
      ...data,
      slug,
      body: DEMO_BODY,
      status: "published",
      publishedAt: new Date(Date.now() - (index + 1) * 3 * 24 * 60 * 60 * 1000),
    });
    console.log(`article   ${data.title}`);
  }

  // Hotel De Gracht's registers, so the year calendar has something to show.
  const gracht = hotels[0];
  const inMonths = (months: number, day = 15) => {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth() + months, day));
  };
  if (!(await Contract.exists({ hotel: gracht._id }))) {
    await Contract.insertMany([
      { hotel: gracht._id, contractFor: "Energy", company: "GroenStroom Zakelijk", startDate: inMonths(-34, 1), endDate: inMonths(2, 1), duration: "3 years", autoRenew: true, noticePeriod: { value: 1, unit: "months" }, paymentTerm: "Monthly", costPerYear: 18400, ledgerAccount: "4410" },
      { hotel: gracht._id, contractFor: "Linen service", company: "Linnen & Co", startDate: inMonths(-10, 1), endDate: inMonths(5, 1), duration: "15 months", autoRenew: false, paymentTerm: "Monthly", costPerYear: 9600, ledgerAccount: "4120" },
      { hotel: gracht._id, contractFor: "Lift maintenance", company: "Technisch Beheer West", startDate: inMonths(-20, 1), endDate: inMonths(8, 1), duration: "2 years", autoRenew: true, noticePeriod: { value: 3, unit: "months" }, costPerYear: 2150, ledgerAccount: "4310" },
      { hotel: gracht._id, contractFor: "Internet & TV", company: "KPN Zakelijk", endDate: inMonths(11, 20), autoRenew: true, noticePeriod: { value: 30, unit: "days" } },
    ]);
    console.log("contracts for Hotel De Gracht");
  }
  if (!(await Permit.exists({ hotel: gracht._id }))) {
    await Permit.insertMany([
      { hotel: gracht._id, type: "Fire extinguishers – yearly check", authority: "Brandwacht Nederland", issueDate: inMonths(-11, 10), expiryDate: inMonths(0, 28) },
      { hotel: gracht._id, type: "Operating permit", authority: "Gemeente Amsterdam", issueDate: inMonths(-30, 1), expiryDate: inMonths(6, 1) },
      { hotel: gracht._id, type: "BHV certificates", authority: "BHV Nederland", issueDate: inMonths(-10, 5), expiryDate: inMonths(2, 5) },
      { hotel: gracht._id, type: "NEN 3140 inspection", authority: "Technisch Beheer West", issueDate: inMonths(-14, 1), expiryDate: inMonths(-1, 20) },
    ]);
    console.log("permits for Hotel De Gracht");
  }
  if (!(await FaultContact.exists({ hotel: gracht._id }))) {
    await FaultContact.insertMany([
      { hotel: gracht._id, name: "Technisch Beheer West", faultType: "Lift", phone: "+31201234567", whatsapp: "31612345678", email: "storing@technisch-beheer-west.test", notes: "24/7 – contract 88412" },
      { hotel: gracht._id, name: "Elektra Direct", faultType: "Electricity", phone: "+31207654321", email: "service@elektra-direct.test" },
      { hotel: gracht._id, name: "Loodgieter Snel", faultType: "Water & plumbing", phone: "+31612340000", whatsapp: "31612340000" },
      { hotel: gracht._id, name: "KPN Zakelijk storingen", faultType: "Internet & phone", phone: "+318000403", website: "https://example.com/storing" },
    ]);
    console.log("storingslijst for Hotel De Gracht");
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Seeding demo content failed:", err);
  process.exit(1);
});
