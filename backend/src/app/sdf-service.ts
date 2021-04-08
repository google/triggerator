import fs from 'fs';
import path from 'path';
import yazl from 'yazl';
import csv_stringify from 'csv-stringify/lib/sync';
import _ from 'lodash';
import { Config } from '../types/config';
import { RuleEvaluator } from './rule-engine';
import { FeedData, SdfFull } from '../types/types';
import SdfGenerator from './sdf-generator';
import DV360Facade from './dv360-facade';
import { getTempDir } from '../env';

export interface GenerateSdfOptions {
  /**
   * Generation mode: generate a new campaign (false) or update an existing (true).
   */
  update?: boolean,
  autoActivate?: boolean,
  startDate?: Date,
  endDate?: Date,
  fileName?: string
}
export default class SdfService {

  constructor(private config: Config, private ruleEvaluator: RuleEvaluator,
    private dv_facade: DV360Facade) { }

  async generateSdf(feedData: FeedData, options: GenerateSdfOptions): Promise<string> {
    let sdf = await this.generateFromTemplate(feedData, 
      options.update || false, 
      options.autoActivate || false,
      options.startDate,
      options.endDate
    );
    let filepath = await this.exportSdf(sdf, options.fileName);
    return filepath;
  }

  /**
   * Export an SDF structure to a local temp file as zip archive.
   * @param sdf SDF structure
   * @returns local file path to a zip archive with SDF files
   */
  async exportSdf(sdf: SdfFull, fileName: string = 'sdf.zip'): Promise<string> {
    var zipfile = new yazl.ZipFile();

    zipfile.addBuffer(Buffer.from(csv_stringify(sdf.campaigns.values, { header: true })), "SDF-Campaigns.csv");
    zipfile.addBuffer(Buffer.from(csv_stringify(sdf.insertionOrders.values, { header: true })), "SDF-InsertionOrders.csv");
    if (sdf.lineItems)
      zipfile.addBuffer(Buffer.from(csv_stringify(sdf.lineItems.values, { header: true })), "SDF-LineItems.csv");
    if (sdf.adGroups)
      zipfile.addBuffer(Buffer.from(csv_stringify(sdf.adGroups.values, { header: true })), "SDF-AdGroups.csv");
    if (sdf.ads)
      zipfile.addBuffer(Buffer.from(csv_stringify(sdf.ads.values, { header: true })), "SDF-AdGroupAds.csv");

    let outputFile = path.join(path.resolve(getTempDir()), fileName);
    let promise = new Promise<string>((resolve, reject) => {
      zipfile.outputStream.pipe(fs.createWriteStream(outputFile)).on("close", () => {
        console.log(`[SdfService] Generated and exported sdf in ${outputFile}`);
        resolve(outputFile);
      }).on("error", (err) => {
        reject(err);
      });
    })
    zipfile.end();

    // TODO: save the file to GCS/Google Drive

    return promise;
  }

  /**
   * Generate an SDF (as structure) for the specified data and configuration.
   * @param feedData A feed data
   * @param update true for updating an existing campaign
   * @param autoActivate true for activating all created campaign
   * @returns 
   */
  async generateFromTemplate(feedData: FeedData, update: boolean, autoActivate: boolean, startDate?: Date, endDate?: Date): Promise<SdfFull> {
    // NOTE: we assume that config has been validated already (via ConfigService)
    const feedInfo = this.config.feedInfo!;
    if (feedInfo.budget_factor_column) {
      var total = 0;
      for (var i = 0; i < feedData.rowCount; i++) {
        total += feedData.get(feedInfo.budget_factor_column, i);
      }
      if (!isNaN(total)) {
        for (var i = 0; i < feedData.rowCount; i++) {
          feedData.set(feedInfo.budget_factor_column, i,
            feedData.get(feedInfo.budget_factor_column, i) / total);
        }
      }
    }

    let tmplSdf: SdfFull = await this.downloadSdfFromDV(this.config.dv360Template!.template_campaign!);
    if (!tmplSdf.campaigns) {
      throw new Error(`[SdfService] Сouldn't load SDF for campaign ${this.config.dv360Template!.template_campaign}, probably due to advertiser and campaing mismatch`);
    }
    let currentSdf: SdfFull | null = null;
    if (update) {
      currentSdf = await this.downloadSdfFromDV(this.config.execution!.campaignId!);
      if (!currentSdf.campaigns) {
        throw new Error(`[SdfService] Сouldn't load SDF for campaign ${this.config.execution!.campaignId}, DV360 returned empty SDF`);
      }
    }
    let generator = new SdfGenerator(this.config, this.ruleEvaluator, feedData, tmplSdf, currentSdf);
    generator.autoActivate = autoActivate;
    generator.startDate = startDate;
    generator.endDate = endDate;
    
    return generator.generate();
  }

  /**
   * Download a SDF with all objects for specified campaign from dV360.
   * @param campaignId Campaign Id
   * @returns SDF structure
   */
  private async downloadSdfFromDV(campaignId: string): Promise<SdfFull> {
    return this.dv_facade.downloadSdf(this.config.execution!.advertiserId!, campaignId);
  }
}