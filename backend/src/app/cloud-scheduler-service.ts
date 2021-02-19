import { cloudscheduler_v1, google } from 'googleapis';
import { GAE_LOCATION } from '../env';
import { JobInfo } from '../types/config';

let schedulerAPI = google.cloudscheduler({ version: "v1" });

export async function getJobName(appId: string): Promise<string> {
  let projectId = await google.auth.getProjectId();
  let locationId: string = await getLocationId(projectId);// Or just hardcode: GAE_LOCATION; ?
  let jobName = `projects/${projectId}/locations/${locationId}/jobs/${appId}`;
  return jobName;
}

export async function getJob(jobName: string): Promise<JobInfo | null> {
  try {
    let job = (await schedulerAPI.projects.locations.jobs.get({
      name: jobName
    })).data;
    let jobInfo: JobInfo = {
      enable: job.state === 'ENABLED',
      schedule: job.schedule!,
      timeZone: job.timeZone!
    };
    return jobInfo;
  } catch (e) {
    console.error(`[CloudSchedulerService] Fetch job ${jobName} failed: `, e.response?.data?.error);
    if (e.response?.data?.error?.status === 'NOT_FOUND') {
      return null;
    }
    throw e;
  }
}

export async function getLocationId(projectId: string) {
  // fetch AppEngine's location via Admin API
  // TODO[segy]: I'm not sure we should do this, as anyway here's some sort of hard-code (adding "1" to region)
  // Then currently (at 2021 April) there're just two locations for Scheduler: us-west1 and europe-west1.
  // Maybe it's easier to get from ENV always: 
  if (GAE_LOCATION)
    return GAE_LOCATION;
  try {
    let gae = (await google.appengine("v1").apps.get({ appsId: `${projectId}` })).data;
    console.log(gae);
    return gae.locationId! + "1";
  } catch (e) {
    console.error(`[CloudSchedulerService] Fetching location from AppEngine Admin API failed: `, e.message);
    throw e;
  }
}

export async function updateJob(appId: string, jobInfo: JobInfo) {
  console.log(`[CloudSchedulerService] Updating scheduler job for configuration ${appId}`);

  // let projectId = await google.auth.getProjectId();
  // let locationId: string = await getLocationId(projectId);// Or just hardcode: GAE_LOCATION; ?
  // let fullpath = `projects/${projectId}/locations/${locationId}`;

  let jobName = await getJobName(appId);
  let jobInfoExist = await getJob(jobName);
  if (jobInfoExist) {
    console.log(`[CloudSchedulerService] Found an existing job: ${jobName}`)
    if (jobInfoExist.enable && !jobInfo.enable) {
      // disable
      try {
        await schedulerAPI.projects.locations.jobs.pause({ name: jobName });
      } catch (e) {
        console.error(`[CloudSchedulerService] Pausing the job ${jobName} failed: `, e.message);
        throw e;
      }
    } else if (!jobInfoExist.enable && jobInfo.enable) {
      // enable
      try {
        await schedulerAPI.projects.locations.jobs.resume({ name: jobName });
      } catch (e) {
        console.error(`[CloudSchedulerService] Resuming the job ${jobName} failed: `, e.message);
        throw e;
      }
    }
    if (jobInfo.enable) {
      // NOTE: Scheduler API doesn't allow to check a job's properties if it's disabled
      if (jobInfo.hasOwnProperty("schedule") || jobInfo.hasOwnProperty("timeZone")) {
        try {
          await schedulerAPI.projects.locations.jobs.patch({
            name: jobName,
            updateMask: "schedule,timeZone",
            requestBody: {
              schedule: jobInfo.schedule,
              timeZone: jobInfo.timeZone,
            }
          });
        } catch (e) {
          console.error(`[CloudSchedulerService] Changing the job's properties failed: `, e.message);
          throw e;
        }
      }
    }
  } else {
    // create a new job
    let createJobRequest: cloudscheduler_v1.Params$Resource$Projects$Locations$Jobs$Create = {
      //parent: fullpath,
      requestBody: {
        name: jobName,
        appEngineHttpTarget: {
          relativeUri: `/api/v1/engine/${appId}/run`,
          httpMethod: 'POST',
          body: Buffer.from(appId).toString('base64')
        },
        schedule: jobInfo.schedule,
        timeZone: jobInfo.timeZone
      }
    };
    console.log(`[CloudSchedulerService] Creating a new scheduler job:\n`, JSON.stringify(createJobRequest));
    try {
      await schedulerAPI.projects.locations.jobs.create(createJobRequest);
    } catch (e) {
      console.error(`[CloudSchedulerService] Job creation failed: `, e.message);
      throw e;
    }
  }
}

export default {
  getJob,
  getJobName,
  updateJob,
  getLocationId
}