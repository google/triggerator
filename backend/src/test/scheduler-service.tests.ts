import SchedulerService from './../app/cloud-scheduler-service';

import assert from 'assert';
suite('CloudSchedulerService', async function() {
  
  test('List jobs', async function() {
    let jobName = await SchedulerService.getJobName('non-existing-id');
    let job = await SchedulerService.getJob(jobName);
    assert.strictEqual(job, null);
  });
});