/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { cloudscheduler_v1, google } from 'googleapis';
import { GAE_LOCATION } from '../env';
import { JobInfo } from '../types/config';
import { Logger } from '../types/logger';
import { getProjectId } from './cloud-utils';

let schedulerAPI = google.cloudscheduler({ version: "v1" });
const COMPONENT = 'CloudSchedulerService';

export default class SchedulerService {
  constructor(private logger: Logger) {
  }

  async getJobParent(): Promise<string> {
    const projectId = await getProjectId();
    const locationId: string = await this.getLocationId(projectId);// Or just hardcode: GAE_LOCATION; ?
    const parent = `projects/${projectId}/locations/${locationId}`;
    return parent;
  }

  async getJobName(appId: string): Promise<string> {
    const parent = await this.getJobParent();
    const jobName = `${parent}/jobs/${appId}`;
    return jobName;
  }

  async getJob(jobName: string): Promise<JobInfo | null> {
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
      this.logger.error(`Fetch job ${jobName} failed: `, e.response?.data?.error, {component: COMPONENT});
      if (e.response?.data?.error?.status === 'NOT_FOUND') {
        return null;
      }
      throw e;
    }
  }

  async getJobList(): Promise<JobInfo[]> {
    try {
      const jobParent = await this.getJobParent();
      let  list = (await schedulerAPI.projects.locations.jobs.list({parent: jobParent})).data;
      if (!list.jobs) return [];
      let jobs: JobInfo[] = list.jobs.map(job => { return {
        name: job.name!,
        enable: job.state === 'ENABLED',
        schedule: job.schedule!,
        timeZone: job.timeZone!
      }});
      return jobs;
    } catch (e) {
      this.logger.error(`Fetch job list failed: `, e.response?.data?.error, {component: COMPONENT});
      throw e;
    }
  }


  async getLocationId(projectId: string) {
    // fetch AppEngine's location via Admin API
    // TODO: I'm not sure we should do this, as anyway here's some sort of hard-code (adding "1" to region)
    // Then currently (at 2021 April) there're just two locations for Scheduler: us-west1 and europe-west1.
    // Maybe it's easier to get from ENV always:
    if (GAE_LOCATION)
      return GAE_LOCATION;
    try {
      let gae = (await google.appengine("v1").apps.get({ appsId: `${projectId}` })).data;
      this.logger.debug(gae);
      return gae.locationId! + "1";
    } catch (e) {
      this.logger.error(`Fetching location from AppEngine Admin API failed: ${e.message}`, {component: COMPONENT});
      throw e;
    }
  }

  async updateJob(appId: string, jobInfo: JobInfo) {
    this.logger.info(`Updating scheduler job for configuration ${appId}`, {component: COMPONENT});

    const jobParent = await this.getJobParent();
    const jobName = `${jobParent}/jobs/${appId}`;
    let jobInfoExist = await this.getJob(jobName);
    if (jobInfoExist) {
      this.logger.debug(`Found an existing job: ${jobName}`, {component: COMPONENT})
      if (jobInfoExist.enable && !jobInfo.enable) {
        // disable
        try {
          await schedulerAPI.projects.locations.jobs.pause({ name: jobName });
        } catch (e) {
          this.logger.error(`Pausing the job ${jobName} failed: ${e.message}`, {component: COMPONENT});
          throw e;
        }
      } else if (!jobInfoExist.enable && jobInfo.enable) {
        // enable
        try {
          await schedulerAPI.projects.locations.jobs.resume({ name: jobName });
        } catch (e) {
          this.logger.error(`Resuming the job ${jobName} failed: ${e.message}`, {component: COMPONENT});
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
            this.logger.error(`Changing the job's properties failed: ${e.message}`, {component: COMPONENT});
            throw e;
          }
        }
      }
    } else {
      // create a new job
      let createJobRequest: cloudscheduler_v1.Params$Resource$Projects$Locations$Jobs$Create = {
        parent: jobParent,
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
      this.logger.info(`Creating a new scheduler job:\n` + JSON.stringify(createJobRequest), {component: COMPONENT, requet: createJobRequest});
      try {
        await schedulerAPI.projects.locations.jobs.create(createJobRequest);
      } catch (e) {
        this.logger.error(`Job creation failed: ${e.message}`, {component: COMPONENT});
        throw e;
      }
    }
  }
}
