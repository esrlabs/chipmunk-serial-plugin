// tslint:disable:no-inferrable-types

import {
  Component,
  OnDestroy,
  ChangeDetectorRef,
  AfterViewInit,
  Input,
  ViewChild,
  ViewContainerRef,
} from "@angular/core";
import { IPortInfo } from "../../common/interface.portinfo";
import { Subject, Observable } from "rxjs";
import * as Toolkit from "chipmunk.client.toolkit";
import Service from "../../services/service";
import { ENotificationType } from "chipmunk.client.toolkit";
import { SidebarVerticalPortOptionsWriteComponent } from "./port.options.write/component";

declare class ResizeObserver {
  constructor(callback: ResizeObserverCallback);
  disconnect(): void;
  observe(target: Element): void;
  unobserve(target: Element): void;
}

type ResizeObserverCallback = (
  entries: ReadonlyArray<ResizeObserverEntry>
) => void;

interface ResizeObserverEntry {
  readonly target: Element;
  readonly contentRect: DOMRectReadOnly;
}

interface ISidebarSize {
  sidebar_width: number;
  sidebar_height: number;
}

enum EDetectionState {
  available = "available",
  none = "none",
  error = "error",
}

@Component({
  selector: "lib-sidebar-ver",
  templateUrl: "./template.html",
  styleUrls: ["./styles.less"],
})
export class SidebarVerticalComponent implements AfterViewInit, OnDestroy {
  @ViewChild("optionsCom", { static: false })
  _optionsCom: SidebarVerticalPortOptionsWriteComponent;

  @Input() public session: string;

  private _logger: Toolkit.Logger = new Toolkit.Logger(
    `Plugin: serial: inj_output_bot:`
  );
  private _destroyed: boolean = false;
  private _interval: any;
  private _timeout = 500;
  private _detectionTimeout: number;
  private _resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { left, top, width, height } = entry.contentRect;
      this.subjects.resize.next({
        sidebar_width: width,
        sidebar_height: height,
      });
    }
  });

  public _ng_ports: IPortInfo[] = [];
  public _ng_detectionError: boolean = false;
  public subjects = {
    tick: new Subject<boolean>(),
    resize: new Subject<ISidebarSize>(),
  };

  constructor(
    private _cdRef: ChangeDetectorRef,
    private _viewRef: ViewContainerRef
  ) {}

  public ngOnDestroy() {
    clearTimeout(this._detectionTimeout);
    this._resizeObserver.unobserve(this._viewRef.element.nativeElement);
    this._destroyed = true;
  }

  public ngAfterViewInit() {
    this._updatePortsList();
    this._resizeObserver.observe(this._viewRef.element.nativeElement);
    this._next();
  }

  public _ng_trackBy(index: number, item: IPortInfo) {
    return index;
  }

  private _next() {
    clearTimeout(this._interval);
    this.subjects.tick.next(true);
    this._interval = setTimeout(this._next.bind(this), this._timeout);
  }

  private _updatePorts(newPorts: IPortInfo[]) {
    this._ng_ports = this._ng_ports.filter((port: IPortInfo) => {
      let prevLength: number = newPorts.length;
      newPorts = newPorts.filter((p: IPortInfo) => {
        return p.path !== port.path;
      });
      return prevLength > newPorts.length;
    });
    newPorts.forEach((port: IPortInfo) => {
      this._ng_ports.push(port);
    });
  }

  private _updatePortsList() {
    let empty_session: boolean;
    Service.requestPorts()
      .then((response) => {
        if (response === true) {
          empty_session = response;
          return;
        }
        this._ng_detectionError = false;
        this._updatePorts(response.ports);
      })
      .catch((error: Error) => {
        this._ng_detectionError = true;
        Service.notify(
          "Error",
          `Fail to fetch ports list due error: ${error.message}`,
          ENotificationType.error
        );
      })
      .finally(() => {
        if (empty_session === true) {
          return;
        }
        setTimeout(() => {
          this._updatePortsList();
        }, 3500);
      });
  }

  private _forceUpdate() {
    if (this._destroyed) {
      return;
    }
    this._cdRef.detectChanges();
  }
}
