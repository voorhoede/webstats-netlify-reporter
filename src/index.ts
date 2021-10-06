import 'dotenv/config';
import { info, setFailed } from '@actions/core';
import { initWebstatsGraphqlClient } from 'webstats-reporters-utils';
import { getSdk } from '../generated/graphql';
import fetch from 'node-fetch';

const projectId = process.env?.WEBSTATS_PROJECT_ID;

if (!projectId) {
  throw new Error('Environment variable WEBSTATS_PROJECT_ID not set');
}

const netlifyId = process.env?.NETLIFY_ID;

if (!netlifyId) {
  throw new Error('Environment variable NETLIFY_ID not set');
}

const netlifyAuthToken = process.env?.NETLIFY_AUTH_TOKEN;

if (!netlifyAuthToken) {
  throw new Error('Environment variable NETLIFY_AUTH_TOKEN not set');
}

const client = initWebstatsGraphqlClient();
const webstatsSdk = getSdk(client);
const BASE_URL = `https://analytics.services.netlify.com/v1`;
const rankedSelections = ['pages'];

const headers = {
  authorization: `Bearer ${netlifyAuthToken}`,
};

const from = new Date();
from.setDate(from.getDate() - 1);
from.setHours(0, 0, 0, 0);

const to = new Date(from);
to.setHours(23, 59, 59);

const range = {
  from: from.getTime(),
  to: to.getTime(),
};

async function main(): Promise<void> {
  try {
    info('Fetching data from Netlify');
    const data = await getNetlifyData();

    info('Transforming Netlify data');
    const transformedData = transformData(data);

    info('Posting Netlify data to Webstats');
    await createNetlifyStatistic(transformedData);
  } catch (e) {
    setFailed(e.message);
  }
}

main();

function generateUrl(id, service, range, resolution, limit) {
  const timeRange = `from=${range.from}&to=${range.to}`;

  if (resolution === 'range') {
    return `${BASE_URL}/${id}/${service}?${timeRange}&timezone=%2B0100&resolution=${resolution}`;
  }

  if (rankedSelections.includes(service)) {
    return `${BASE_URL}/${id}/ranking/${service}?${timeRange}&resolution=${resolution}&limit=${limit}`;
  }

  return `${BASE_URL}/${id}/${service}?${timeRange}&timezone=%2B0100`;
}

async function getNetlifyData(): Promise<any> {
  const data = await fetch(
    generateUrl(netlifyId, 'pages', range, 'day', 9999),
    {
      headers,
    },
  );

  const json = await data.json();

  if (json.code === 401) {
    throw new Error("Unauthorized")
  }

  return json
}

function transformData(data: { data: any[] }): { version: string; pages: any[] } {
  return {
    version: '1',
    pages: data.data.map((page) => {
      return {
        pageUrl: page.resource,
        pageviews: page.count,
        visitors: 0,
        dimension: 'day',
        startDateTime: range.from / 1000,
        endDateTime: range.to / 1000,
        createdAt: range.from / 1000,
      };
    }),
  };
}

async function createNetlifyStatistic(
  data: Record<string, unknown>,
): Promise<void> {
  await webstatsSdk.createNetlifyStatistic({
    projectId: projectId as string,
    data,
  });
}
