/**
 * Copyright 2021 Google LLC
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
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { saveAs } from 'file-saver';
import { Observable, Subject, throwError } from 'rxjs';
import { catchError, tap, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class BackendService {
  constructor(private http: HttpClient) { }
  baseUrl = '/api/v1';

  private getBaseHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    });
    return headers; //this.addAuthorization(headers);
  }

  private getUrl(url: string) {
    if (!url) throw new Error(`[BackendService] url must be specified`);
    if (!url.startsWith('/')) url = '/' + url;
    return this.baseUrl + url;
  }

  getEvents(url: string, params?: Record<string, any>): Observable<string> {
    let subject = new Subject<string>();
    if (params) {
      if (!url.includes("?")) url += "?";
      for (const key of Object.keys(params)) {
        url += (key + "=" + params[key] + "&")
      }
      if (url[url.length-1] === "&") 
        url = url.substring(0, url.length-2);
    }
    var evtSource = new EventSource(this.getUrl(url));
    evtSource.onmessage = (e) => {
      if (!e) {
        evtSource.close();
        subject.complete();
      } else {
        if (e.data.startsWith("error:")) {
          evtSource.close();
          subject.error(e.data.substring("error:".length));
        } else {
          subject.next(e.data);
        }
      }
    };
    evtSource.onerror = (e) => {
      if (e.eventPhase == EventSource.CLOSED) {
        evtSource.close();
        subject.complete();
      } else {
        subject.error(e);
      }
    };
    
    return subject;
  }

  async getApi<T>(url: string, params?: Record<string, any>): Promise<T> {

    return this.http.get<T>(this.getUrl(url),
      {
        headers: this.getBaseHeaders(),
        params: params
      })
      .toPromise();
  }

  postApi(url: string, payload?: any): Promise<any> {
    return this.http.post(
      this.getUrl(url),
      payload,
      { headers: this.getBaseHeaders() })
      .toPromise();
  }

  async getFile(url: string, params?: Record<string, any>) {
    let headers = this.getBaseHeaders()
      .set('Content-Type', 'application/x-www-form-urlencoded');
    try  {
      let res = await this.http.get<HttpResponse<Blob>>(this.getUrl(url), {
        responseType: 'blob' as 'json',
        observe: 'response',
        headers: headers,
        params: params
      }).toPromise();
      const fileName = this.getFileNameFromHttpResponse(res);
      saveAs(res.body, fileName);
    } catch(e) {
      if (e.error && Object.getPrototypeOf(e.error).toString() === '[object Blob]') {
        let errorJson = await (<Blob>e.error).text();
        try {
          let error = JSON.parse(errorJson);
          e.error = error;
        } catch {}
      }
      throw e;
    }
  }

  private getFileNameFromHttpResponse(httpResponse) {
    const contentDispositionHeader = httpResponse.headers.get('Content-Disposition');
    const result = contentDispositionHeader.split(';')[1].trim().split('=')[1];
    return result.replace(/"/g, '');
  }
}