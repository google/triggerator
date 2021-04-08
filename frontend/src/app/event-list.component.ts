import { formatDate } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { MatExpansionPanel } from '@angular/material/expansion';
import { ComponentBase } from './component-base';

@Component({
  selector: 'tr-event-list',
  templateUrl: './event-list.component.html'
})
export class EventListComponent implements OnInit {
  @ViewChild("eventList") eventList: ElementRef;
  @ViewChild("executionLogPanel") executionLogPanel: MatExpansionPanel;

  ngOnInit(): void {}

  addMessage(msg: string, addTimestamp: boolean = true) {
    var newElement = document.createElement("li");
    if (addTimestamp) {
      msg = formatDate(new Date(), "dd/MM hh:mm:ss", 'en') + " " + msg;
    }
    newElement.innerHTML = msg;
    this.eventList.nativeElement.appendChild(newElement);    
  }

  clearExecutionLog() {
    this.eventList.nativeElement.innerHTML = "";
  }

  open() {
    this.executionLogPanel.open();
  }
}