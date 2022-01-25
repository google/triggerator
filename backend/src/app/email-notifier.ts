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
import nodemailer from 'nodemailer';
import { MAILER_CONFIG } from './../env';

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<any> {
  if (!MAILER_CONFIG) return;
  let transporter = nodemailer.createTransport(MAILER_CONFIG);
  var message = {
    from: MAILER_CONFIG.from || MAILER_CONFIG.auth.user,
    to,
    subject,
    text,
    html
  };
  let info = await transporter.sendMail(message);
  return info;
}
