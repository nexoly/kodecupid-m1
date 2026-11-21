import 'dotenv/config';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import sharp from 'sharp';
import { hashPassword } from '../src/admin/passwords';
import { loadEnv } from '../src/config/app-config';
import { PrismaClient } from '../src/generated/prisma/client';
import { ONBOARDING_SEQUENCE } from '../src/onboarding/onboarding.sequence';

/**
 * Idempotent seed:
 *   1 Super Admin, 1 Moderator, 5 sample members (one paused, one sparse,
 *   one with photos) so the client can test both admin roles and every privacy
 *   state without registering first.
 *
 * Run with: pnpm db:seed
 */

const env = loadEnv();
// Seeds run through the direct connection; Neon's pooler is for the app only.
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL_UNPOOLED || env.DATABASE_URL,
  }),
});

const LOCAL_STORAGE_DIR = join(process.cwd(), env.STORAGE_LOCAL_DIR);

interface SeedMember {
  phone: string;
  phoneCountry: string;
  displayName: string;
  dateOfBirth: string;
  genderIdentity: 'WOMAN' | 'MAN' | 'NON_BINARY' | 'OTHER' | 'PREFER_NOT_TO_SAY';
  interestedIn: ('WOMEN' | 'MEN' | 'NON_BINARY_PEOPLE' | 'EVERYONE')[];
  profession: string;
  professionCategory:
    | 'HEALTHCARE'
    | 'EDUCATION'
    | 'EMS'
    | 'LAW_ENFORCEMENT'
    | 'FIREFIGHTER'
    | 'MILITARY_VETERAN'
    | 'ENGINEER'
    | 'TECHNICIAN'
    | 'OTHER';
  employerName?: string;
  shiftSchedule: 'DAY' | 'NIGHT' | 'ROTATING' | 'FLEXIBLE' | 'ON_CALL' | 'OTHER';
  city: string;
  region?: string;
  country: string;
  latitude?: number;
  longitude?: number;
  religion?: string;
  ethnicity?: string;
  languages: string[];
  heightCm: number;
  drinking: 'NEVER' | 'RARELY' | 'SOCIALLY' | 'OFTEN' | 'DAILY';
  smoking: 'NEVER' | 'RARELY' | 'SOCIALLY' | 'OFTEN' | 'DAILY';
  exercise: 'NEVER' | 'SOMETIMES' | 'REGULARLY' | 'DAILY';
  educationLevel: 'HIGH_SCHOOL' | 'ASSOCIATE' | 'BACHELORS' | 'MASTERS' | 'DOCTORATE' | 'PROFESSIONAL' | 'OTHER';
  credentials: ('MD' | 'DO' | 'RN' | 'NP' | 'PA' | 'PHD' | 'JD' | 'DDS' | 'PHARMD' | 'EMT' | 'LPN' | 'CNA' | 'OTHER')[];
  relationshipGoals: ('LONG_TERM' | 'LIFE_PARTNER' | 'CASUAL' | 'FRIENDSHIP' | 'OPEN_TO_ANYTHING')[];
  familyPlans: 'WANT_CHILDREN' | 'OPEN_TO_CHILDREN' | 'DONT_WANT_CHILDREN' | 'HAVE_CHILDREN_WANT_MORE' | 'HAVE_CHILDREN_NO_MORE' | 'UNDECIDED';
  kids: 'NO_KIDS' | 'HAVE_KIDS' | 'PREFER_NOT_TO_SAY';
  bio: string;
  paused?: boolean;
  photos?: number;
  accent?: string;
  workplaceName?: string;
  workplacePrivacyEnabled?: boolean;
  workplaceHideRadiusMeters?: number;
  /** Explicit privacy overrides on top of the sensible defaults. */
  visibility?: { field: string; visibility: 'PUBLIC' | 'HIDDEN' }[];
}

const MEMBERS: SeedMember[] = [
  {
    phone: '+8801711000001',
    phoneCountry: 'BD',
    displayName: 'Ayesha R.',
    dateOfBirth: '1997-03-14',
    genderIdentity: 'WOMAN',
    interestedIn: ['MEN'],
    profession: 'Registered Nurse',
    professionCategory: 'HEALTHCARE',
    employerName: 'Dhaka Medical College Hospital',
    shiftSchedule: 'NIGHT',
    city: 'Dhaka',
    region: 'Dhaka Division',
    country: 'BD',
    latitude: 23.8103,
    longitude: 90.4125,
    workplaceName: 'Dhaka Medical College Hospital',
    workplacePrivacyEnabled: false,
    workplaceHideRadiusMeters: 500,
    religion: 'Islam',
    ethnicity: 'Bengali',
    languages: ['Bengali', 'English'],
    heightCm: 163,
    drinking: 'NEVER',
    smoking: 'NEVER',
    exercise: 'SOMETIMES',
    educationLevel: 'BACHELORS',
    credentials: ['RN'],
    relationshipGoals: ['LONG_TERM'],
    familyPlans: 'OPEN_TO_CHILDREN',
    kids: 'NO_KIDS',
    bio: 'Night-shift nurse, coffee enthusiast and amateur baker. Looking for someone who understands odd hours and still wants real weekends.',
    photos: 2,
    accent: '#D91E36',
    visibility: [{ field: 'RELIGION', visibility: 'PUBLIC' }],
  },
  {
    phone: '+14155550101',
    phoneCountry: 'US',
    displayName: 'Marcus L.',
    dateOfBirth: '1992-07-02',
    genderIdentity: 'MAN',
    interestedIn: ['WOMEN'],
    profession: 'Paramedic',
    professionCategory: 'EMS',
    employerName: 'SFFD',
    shiftSchedule: 'ROTATING',
    city: 'San Francisco',
    region: 'California',
    country: 'US',
    latitude: 37.7749,
    longitude: -122.4194,
    ethnicity: 'Asian',
    languages: ['English', 'Tagalog'],
    heightCm: 180,
    drinking: 'SOCIALLY',
    smoking: 'NEVER',
    exercise: 'REGULARLY',
    educationLevel: 'ASSOCIATE',
    credentials: ['EMT'],
    relationshipGoals: ['LONG_TERM', 'LIFE_PARTNER'],
    familyPlans: 'WANT_CHILDREN',
    kids: 'NO_KIDS',
    bio: '24-hour shifts, trail runs on my days off. I cook a mean adobo and I am terrible at board games.',
    photos: 1,
    accent: '#16263E',
  },
  {
    phone: '+14155550102',
    phoneCountry: 'US',
    displayName: 'Sofia A.',
    dateOfBirth: '1999-11-23',
    genderIdentity: 'WOMAN',
    interestedIn: ['EVERYONE'],
    profession: 'Nurse Practitioner',
    professionCategory: 'HEALTHCARE',
    employerName: 'Ascension Seton',
    shiftSchedule: 'DAY',
    city: 'Austin',
    region: 'Texas',
    country: 'US',
    latitude: 30.2672,
    longitude: -97.7431,
    religion: 'Catholic',
    languages: ['English', 'Spanish'],
    heightCm: 168,
    drinking: 'RARELY',
    smoking: 'NEVER',
    exercise: 'REGULARLY',
    educationLevel: 'MASTERS',
    credentials: ['NP', 'RN'],
    relationshipGoals: ['LONG_TERM'],
    familyPlans: 'OPEN_TO_CHILDREN',
    kids: 'NO_KIDS',
    bio: 'Primary care NP. Live music, tacos and long walks with my rescue dog Peppa.',
    photos: 1,
    accent: '#D99B26',
  },
  {
    phone: '+14155550103',
    phoneCountry: 'US',
    displayName: 'Dev P.',
    dateOfBirth: '1995-01-09',
    genderIdentity: 'MAN',
    interestedIn: ['WOMEN', 'NON_BINARY_PEOPLE'],
    profession: 'Pharmacist',
    professionCategory: 'HEALTHCARE',
    employerName: 'Mount Sinai',
    shiftSchedule: 'NIGHT',
    city: 'New York',
    region: 'New York',
    country: 'US',
    latitude: 40.7128,
    longitude: -74.006,
    ethnicity: 'South Asian',
    languages: ['English', 'Hindi', 'Gujarati'],
    heightCm: 175,
    drinking: 'NEVER',
    smoking: 'NEVER',
    exercise: 'SOMETIMES',
    educationLevel: 'DOCTORATE',
    credentials: ['PHARMD'],
    relationshipGoals: ['CASUAL', 'FRIENDSHIP'],
    familyPlans: 'UNDECIDED',
    kids: 'NO_KIDS',
    bio: 'Overnight pharmacist. I know every 24-hour diner in Manhattan and I am not sorry.',
    paused: true,
    accent: '#2D3748',
    visibility: [{ field: 'PROFESSION', visibility: 'HIDDEN' }],
  },
  {
    phone: '+14155550104',
    phoneCountry: 'US',
    displayName: 'Nora H.',
    dateOfBirth: '1988-05-30',
    genderIdentity: 'WOMAN',
    interestedIn: ['MEN', 'WOMEN'],
    profession: 'Emergency Physician',
    professionCategory: 'HEALTHCARE',
    employerName: 'Northwestern Memorial',
    shiftSchedule: 'ROTATING',
    city: 'Chicago',
    region: 'Illinois',
    country: 'US',
    latitude: 41.8781,
    longitude: -87.6298,
    workplaceName: 'Northwestern Memorial',
    workplacePrivacyEnabled: true,
    workplaceHideRadiusMeters: 800,
    languages: ['English', 'Arabic'],
    heightCm: 170,
    drinking: 'SOCIALLY',
    smoking: 'NEVER',
    exercise: 'SOMETIMES',
    educationLevel: 'PROFESSIONAL',
    credentials: ['MD'],
    relationshipGoals: ['LIFE_PARTNER'],
    familyPlans: 'HAVE_CHILDREN_NO_MORE',
    kids: 'HAVE_KIDS',
    bio: 'ER doc, mother of one very opinionated seven-year-old. Looking for someone kind and unbothered by pagers.',
    accent: '#8B5CF6',
    visibility: [
      { field: 'RELIGION', visibility: 'PUBLIC' },
      { field: 'ETHNICITY', visibility: 'PUBLIC' },
    ],
  },
];
async function seedAdmin(
  email: string,
  name: string,
  role: 'SUPER_ADMIN' | 'MODERATOR',
  password: string,
): Promise<void> {
  // Idempotent and non-destructive: an existing admin keeps the role and
  // password they have now (a Super Admin may have changed either). Set
  // SEED_RESET_ADMIN_PASSWORDS=true to deliberately re-apply the seed password.
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    if (process.env.SEED_RESET_ADMIN_PASSWORDS === 'true') {
      await prisma.adminUser.update({
        where: { email },
        data: { passwordHash: await hashPassword(password) },
      });
    }
    return;
  }
  await prisma.adminUser.create({
    data: { email, name, role, passwordHash: await hashPassword(password), status: 'ACTIVE' },
  });
}

async function seedPhoto(profileId: string, index: number, accent: string): Promise<void> {
  await mkdir(LOCAL_STORAGE_DIR, { recursive: true });
  const key = `seed_${profileId.slice(-10)}_${index}.webp`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${accent}" />
          <stop offset="100%" stop-color="#16263E" />
        </linearGradient>
      </defs>
      <rect width="800" height="1000" fill="url(#g)" />
      <circle cx="400" cy="420" r="150" fill="rgba(255,255,255,0.14)" />
      <text x="400" y="470" font-family="Arial, sans-serif" font-size="96" fill="#FFFFFF"
        text-anchor="middle">KC</text>
      <text x="400" y="560" font-family="Arial, sans-serif" font-size="34" fill="#F7F8FA"
        text-anchor="middle">Sample photo ${index + 1}</text>
    </svg>`;

  const buffer = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
  await writeFile(join(LOCAL_STORAGE_DIR, key), buffer);

  await prisma.profilePhoto.create({
    data: {
      profileId,
      storageKey: key,
      mimeType: 'image/webp',
      sizeBytes: buffer.byteLength,
      width: 800,
      height: 1000,
      sortOrder: index,
      isPrimary: index === 0,
      moderationStatus: 'APPROVED',
    },
  });
}

async function seedMember(member: SeedMember): Promise<string> {
  const now = new Date();
  const user = await prisma.user.upsert({
    where: { phoneE164: member.phone },
    create: {
      phoneE164: member.phone,
      phoneCountry: member.phoneCountry,
      status: 'ACTIVE',
      phoneVerifiedAt: now,
      ageVerifiedAt: now,
      onboardingCompletedAt: now,
      lastLoginAt: now,
    },
    update: {
      status: 'ACTIVE',
      phoneVerifiedAt: now,
      ageVerifiedAt: now,
      onboardingCompletedAt: now,
    },
  });

  const profileData = {
    displayName: member.displayName,
    dateOfBirth: new Date(`${member.dateOfBirth}T00:00:00.000Z`),
    genderIdentity: member.genderIdentity,
    interestedIn: member.interestedIn,
    profession: member.profession,
    professionCategory: member.professionCategory,
    employerName: member.employerName ?? null,
    shiftSchedule: member.shiftSchedule,
    city: member.city,
    region: member.region ?? null,
    country: member.country,
    latitude: member.latitude ?? null,
    longitude: member.longitude ?? null,
    religion: member.religion ?? null,
    ethnicity: member.ethnicity ?? null,
    languages: member.languages,
    heightCm: member.heightCm,
    drinking: member.drinking,
    smoking: member.smoking,
    exercise: member.exercise,
    educationLevel: member.educationLevel,
    credentials: member.credentials,
    relationshipGoals: member.relationshipGoals,
    familyPlans: member.familyPlans,
    kids: member.kids,
    bio: member.bio,
    status: member.paused ? ('PAUSED' as const) : ('ACTIVE' as const),
    pausedAt: member.paused ? now : null,
    workplaceName: member.workplaceName ?? null,
    workplacePrivacyEnabled: member.workplacePrivacyEnabled ?? false,
    workplaceHideRadiusMeters: member.workplaceHideRadiusMeters ?? null,
  };

  const profile = await prisma.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...profileData },
    update: profileData,
  });

  await prisma.userPreference.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      lookingFor: member.relationshipGoals,
      ageRangeMin: 25,
      ageRangeMax: 45,
      maxDistanceKm: 40,
    },
    update: { lookingFor: member.relationshipGoals },
  });

  await prisma.onboardingProgress.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      completedSteps: ONBOARDING_SEQUENCE,
      currentStep: 'complete',
      completedAt: now,
    },
    update: { completedSteps: ONBOARDING_SEQUENCE, currentStep: 'complete', completedAt: now },
  });

  const acceptances = [
    { documentType: 'TERMS' as const, documentVersion: env.TERMS_VERSION },
    { documentType: 'COMMUNITY_GUIDELINES' as const, documentVersion: env.GUIDELINES_VERSION },
    { documentType: 'SAFETY_TIPS' as const, documentVersion: env.SAFETY_TIPS_VERSION },
    { documentType: 'PRIVACY' as const, documentVersion: env.PRIVACY_VERSION },
  ];

  for (const acceptance of acceptances) {
    await prisma.legalAcceptance.upsert({
      where: {
        userId_documentType_documentVersion: {
          userId: user.id,
          documentType: acceptance.documentType,
          documentVersion: acceptance.documentVersion,
        },
      },
      create: {
        userId: user.id,
        documentType: acceptance.documentType,
        documentVersion: acceptance.documentVersion,
      },
      update: {},
    });
  }

  for (const override of member.visibility ?? []) {
    await prisma.profileFieldVisibility.upsert({
      where: { profileId_field: { profileId: profile.id, field: override.field as never } },
      create: {
        profileId: profile.id,
        field: override.field as never,
        visibility: override.visibility,
      },
      update: { visibility: override.visibility },
    });
  }

  // Recreate photos so re-running the seed never duplicates them.
  const existingPhotos = await prisma.profilePhoto.findMany({ where: { profileId: profile.id } });
  for (const photo of existingPhotos) {
    await prisma.profilePhoto.delete({ where: { id: photo.id } });
    await unlink(join(LOCAL_STORAGE_DIR, photo.storageKey)).catch(() => undefined);
  }

  for (let index = 0; index < (member.photos ?? 0); index += 1) {
    await seedPhoto(profile.id, index, member.accent ?? '#D91E36');
  }

  return user.id;
}

/** Metro launch records. The 200 paid-subscriber threshold gates future opening. */
const REGIONS = [
  {
    slug: 'atlanta-ga',
    name: 'Atlanta',
    state: 'Georgia',
    country: 'US',
    latitude: 33.749,
    longitude: -84.388,
    launchStatus: 'PRE_LAUNCH' as const,
    paidSubscriberThreshold: 200,
    paidSubscriberCount: 0,
  },
  {
    slug: 'charlotte-nc',
    name: 'Charlotte',
    state: 'North Carolina',
    country: 'US',
    latitude: 35.2271,
    longitude: -80.8431,
    launchStatus: 'PLANNED' as const,
    paidSubscriberThreshold: 200,
    paidSubscriberCount: 0,
  },
];

async function seedRegions(): Promise<void> {
  for (const region of REGIONS) {
    await prisma.region.upsert({
      where: { slug: region.slug },
      create: region,
      update: {
        name: region.name,
        state: region.state,
        country: region.country,
        latitude: region.latitude,
        longitude: region.longitude,
        launchStatus: region.launchStatus,
        paidSubscriberThreshold: region.paidSubscriberThreshold,
      },
    });
  }
}

const DEFAULT_SEED_PASSWORDS = new Set(['ChangeMe!Admin1', 'ChangeMe!Mod1']);

function assertSafeSeedPasswords(): void {
  const hosted = env.NODE_ENV === 'staging' || env.NODE_ENV === 'production';
  if (!hosted) return;
  for (const [key, value] of [
    ['SEED_ADMIN_PASSWORD', env.SEED_ADMIN_PASSWORD],
    ['SEED_MODERATOR_PASSWORD', env.SEED_MODERATOR_PASSWORD],
  ] as const) {
    if (DEFAULT_SEED_PASSWORDS.has(value) || value.length < 12) {
      throw new Error(
        `${key} must be set to a unique password of at least 12 characters on ${env.NODE_ENV}.`,
      );
    }
  }
}

async function main(): Promise<void> {
  assertSafeSeedPasswords();
  console.log('› Seeding KodeCupid…\n');

  await seedRegions();

  await seedAdmin(env.SEED_ADMIN_EMAIL, 'KodeCupid Super Admin', 'SUPER_ADMIN', env.SEED_ADMIN_PASSWORD);
  await seedAdmin(
    env.SEED_MODERATOR_EMAIL,
    'KodeCupid Moderator',
    'MODERATOR',
    env.SEED_MODERATOR_PASSWORD,
  );

  const memberIds: string[] = [];
  for (const member of MEMBERS) {
    memberIds.push(await seedMember(member));
  }

  const memberCount = await prisma.user.count();
  const adminCount = await prisma.adminUser.count();
  const regionCount = await prisma.region.count();

  console.log(`✓ Admins: ${adminCount}`);
  console.log(`✓ Members: ${memberCount} (${memberIds.length} sample profiles seeded)`);
  console.log(`✓ Regions: ${regionCount} (${REGIONS.map((region) => region.name).join(', ')})`);
  // Passwords are never printed: logs on hosted platforms are retained and shared.
  console.log('\nAdmin logins (passwords come from SEED_ADMIN_PASSWORD / SEED_MODERATOR_PASSWORD)');
  console.log(`  Super Admin  ${env.SEED_ADMIN_EMAIL}`);
  console.log(`  Moderator    ${env.SEED_MODERATOR_EMAIL}`);
  console.log('\nSample member numbers (on staging, list these in OTP_DEBUG_PHONES to sign in with the debug code):');
  for (const member of MEMBERS) {
    console.log(
      `  ${member.phone}  ${member.displayName}${member.paused ? '  [paused]' : ''}`,
    );
  }
  console.log('');
}

main()
  .catch((error) => {
    console.error('\n✗ Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
