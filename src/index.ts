import { AirtopClient } from "@airtop/sdk";
import type { ExternalSessionWithConnectionInfo, WindowId } from "@airtop/sdk/api";
import * as fs from 'node:fs';
import path from "node:path";
import dotenv from 'dotenv';

dotenv.config();

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
}

interface ProfileWithQuery extends UserProfile {
  query: string;
}

interface ProfileWithLinkedInProfile extends ProfileWithQuery {
  linkedInProfile: string;
}

const generateGoogleSearchQuery = (userProfile: UserProfile) => {
  const query = `${userProfile.firstName} ${userProfile.lastName} ${userProfile.email} linkedin`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

const fetchProfilesFromFile = async () => {
  const projectRoot = path.resolve(__dirname, '../');
  const filePath = path.join(projectRoot, 'data', 'profiles.csv');

  const data = fs.readFileSync(filePath, 'utf8');
  const lines = data.split('\n');
  // Skip the header row
  const profiles = lines
    .slice(1)
    .map(line => {
      const [email, firstName, lastName] = line.split(',');
      return {
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim()
      } as UserProfile;
    });

  return profiles;
}

const generateProfilesWithSearchQueries = (profiles: UserProfile[]): ProfileWithQuery[] => {
  return profiles.map(p => {
    return {
      ...p,
      query: generateGoogleSearchQuery(p)
    }
  });
}

const searchForLinkedInProfile = async (session: ExternalSessionWithConnectionInfo, window: WindowId, client: AirtopClient, profile: ProfileWithQuery): Promise<string | null> => {
  try {
    client.windows.loadUrl(session.id, window.windowId, {
      url: profile.query,
    })
    console.log(`Searching for ${profile.firstName} ${profile.lastName} ${profile.email} on LinkedIn`);
    const result = await client.windows.pageQuery(session.id, window.windowId, {
      prompt: `You are tasked with retrieving a person's LinkedIn profile URL. Please locate the LinkedIn profile for the specified individual and return only the URL. 
      LinkedIn profile URLs begin with https://www.linkedin.com/in/ so use that to identify the profile. There may be profiles with country based subdomains like https://nl.linkedin.com/in/ that you should also use.
      If there are multiple links, return the one that most closely matches the profile based on the email domain and the name. 
      Do not return any other text than the URL.
      Do not return any urls corresponding to posts that may begin with https://www.linkedin.com/posts/
      If you are unable to find the profile, return 'Error'`
    });
    return result.data.modelResponse;
  } catch (error) {
    console.error("Error with profile", profile.email, error);
    return null;
  }
}

const runSequentialBatch = async (client: AirtopClient, profiles: ProfileWithQuery[]) => {
  const session = await client.sessions.create();
  const window = await client.windows.create(session.data.id);

  const profilesWithLinkedInProfiles: ProfileWithLinkedInProfile[] = [];
  for (const profile of profiles) {
    const linkedInProfile = await searchForLinkedInProfile(session.data, window.data, client, profile);
    if (linkedInProfile) {
      const result = {
        ...profile,
        linkedInProfile
      }
      profilesWithLinkedInProfiles.push(result);
    }
  }

  await client.sessions.terminate(session.data.id);

  return profilesWithLinkedInProfiles;
}

const runBatchesInParallel = async (client: AirtopClient, batches: ProfileWithQuery[][]) => {
  const promises = batches.map(batch => runSequentialBatch(client, batch));
  const results = await Promise.all(promises);
  return results.flat();
}

const saveProfilesToFile = (profiles: ProfileWithLinkedInProfile[]) => {
  const projectRoot = path.resolve(__dirname, '../');
  const filePath = path.join(projectRoot, 'output', 'profiles_with_linked_in_profiles.csv');
  const csvHeaders = ['email', 'firstName', 'lastName', 'linkedInProfile'];
  const csvRows = profiles.map(profile => [
    profile.email,
    profile.firstName,
    profile.lastName,
    profile.linkedInProfile,
  ]);
  const csvContent = [
    csvHeaders.join(','),
    ...csvRows.map(row => row.join(','))
  ].join('\n');
  fs.writeFileSync(filePath, csvContent);
}

const main = async () => {
  const apiKey = process.env.AIRTOP_API_KEY;
  if (!apiKey) {
    throw new Error("AIRTOP_API_KEY is not set");
  }

  const client = new AirtopClient({ apiKey });
  const profiles = await fetchProfilesFromFile();
  const profilesWithQueries = generateProfilesWithSearchQueries(profiles);
  const batchSize = 2;
  const batches: ProfileWithQuery[][] = [];

  // Split the profiles into batches
  for (let i = 0; i < profilesWithQueries.length; i += batchSize) {
    batches.push(profilesWithQueries.slice(i, i + batchSize));
  }

  const profilesWithLinkedInProfiles = await runBatchesInParallel(client, batches);
  saveProfilesToFile(profilesWithLinkedInProfiles);
  console.log("Results:\n", profilesWithLinkedInProfiles);
  console.log("--------------------------------");
  console.log(`Saved ${profilesWithLinkedInProfiles.length} profiles to file`);
  console.log("--------------------------------");
  console.log("Done");
}
main();