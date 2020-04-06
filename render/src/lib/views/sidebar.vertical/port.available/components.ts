// tslint:disable:no-inferrable-types

import { Component, OnDestroy, Input, AfterViewInit, ViewChildren, QueryList, ElementRef, ChangeDetectorRef, OnInit } from '@angular/core';
import { IPortInfo, IPortState } from '../../../common/interface.portinfo';
import Chart from 'chart.js';
import { Subscription, Subject } from 'rxjs';
import Service from '../../../services/service';
import { EHostEvents } from '../../../common/host.events';
import { SidebarVerticalPortDialogComponent } from '../port.options/component';
import { IOptions, CDefaultOptions } from '../../../common/interface.options';
import { ENotificationType } from 'chipmunk.client.toolkit';

interface Irgb {
    red: number;
    green: number;
    blue: number;
    opacity: number;
}

const COptions = {
    STEP: 300
};

@Component({
    selector: 'lib-dia-port-available-com',
    templateUrl: './template.html',
    styleUrls: ['./styles.less']
})

export class DialogAvailablePortComponent implements OnDestroy, AfterViewInit, OnInit {

    @Input() port: IPortInfo;
    @Input() observables: {tick: Subject<boolean>, resize: Subject<{ sidebar_width: number, sidebar_height: number }>};

    @ViewChildren('canvas') canvases: QueryList<ElementRef>;

    readonly animation = 5000;

    private _subscriptions: { [key: string]: Subscription } = {};
    private _canvas: ElementRef<HTMLCanvasElement>;
    private _ctx: any;
    private _read: number = 0;
    private _readSum: number = 0;
    private _chart: Chart;
    private _chart_data = new Array<number>(30);
    private _chart_labels = new Array(COptions.STEP).fill('');
    private _chart_limit: number;
    private _destroyed: boolean = false;
    private _options: IOptions;
    private _defaultOptions: IOptions = Object.assign({}, CDefaultOptions);
    private _sidebar_width: number;
    private _session: string;

    public _ng_isConnected: boolean = false;

    constructor(private _cdRef: ChangeDetectorRef) {
    }

    ngAfterViewInit() {
        this._canvas = this.canvases.find(canvas => canvas.nativeElement.id === `canvas_${this.port.path}`);
        this._createChart();
        this._subscriptions.Subscription = this.observables.tick.subscribe((tick: boolean) => {
            if (tick) {
                this._update();
            }
        });

        this._subscriptions.Subscription = this.observables.resize.subscribe((size: any) => {
            this._sidebar_width = size.sidebar_width;
            this._chart_limit = Math.round(this._sidebar_width / 10);
            this._chart.config.data.labels = this._chart_labels.slice(0, this._chart_limit);
        });

        this._subscriptions.Subscription = Service.getObservable().event.subscribe((message: any) => {
            if (message.event === EHostEvents.spyState && message.load[this.port.path]) {
                this._read = message.load[this.port.path];
                this._readSum += this._read;
            } else if (message.event === EHostEvents.state && message.state[this.port.path].ioState.read) {
                this._read = message.state[this.port.path].ioState.read;
                this._readSum += this._read;
            }
            this._forceUpdate();
        });

        Service.startSpy([this._defaultOptions]);
    }

    ngOnInit() {
        this._session = Service.getSessionID();
        this._loadSession();
        this._defaultOptions.path = this.port.path;
    }

    ngOnDestroy() {
        this._saveSession();
        if (this._chart) {
            this._chart.destroy();
            this._chart = undefined;
        }
        Object.keys(this._subscriptions).forEach((key: string) => {
            this._subscriptions[key].unsubscribe();
        });
        this._destroyed = true;
    }

    private _forceUpdate() {
        if (this._destroyed) {
            return;
        }
        this._cdRef.detectChanges();
    }

    private _loadSession() {
        const cSessionPort = Service.sessionPort[this._session];
        if (cSessionPort && cSessionPort[this.port.path]) {
            const cPort = cSessionPort[this.port.path];
            this._ng_isConnected = cPort.connected;
            this._readSum = cPort.read;
            this._chart_data = cPort.sparkline_data;
            this._chart_limit = cPort.sparkline_limit;
        } else {
            console.error('Something went wrong while loading the session');
        }
    }

    private _saveSession() {
        const cSessionPort = Service.sessionPort[this._session];
        if (cSessionPort) {
            cSessionPort[this.port.path] = {
                connected: this._ng_isConnected,
                read: this._readSum,
                sparkline_data: this._chart_data,
                sparkline_limit: this._chart_limit,
                written: 0
            };
        } else {
            console.error('The session does not exist on service to save the data');
        }
    }

    private _formatLoad(load: number): string {
        let read: string = '';
        if (load > 1024 * 1024 * 1024) {
            read = (load / 1024 / 1024 / 1024).toFixed(2) + ' Gb';
        } else if (load > 1024 * 1024) {
            read = (load / 1024 / 1024).toFixed(2) + ' Mb';
        } else if (load > 1024) {
            read = (load / 1024).toFixed(2) + ' Kb';
        } else {
            read = load + ' b';
        }
        return read;
    }

    private _color(): number {
        return Math.round(Math.random() * 255);
    }

    private _colorize(): string {
        const rgb: Irgb = {
            red: this._color(),
            green: this._color(),
            blue: this._color(),
            opacity: 1,
        };
        return `rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, ${rgb.opacity})`;
    }

    private _createChart() {
        this._ctx = this._canvas.nativeElement.getContext('2d');
        if (this._chart_limit === null) {
            this._chart_limit = this._canvas.nativeElement.width / 10;
        }
        this._chart = new Chart(this._ctx, {
            type: 'line',
            data: {
                labels: this._chart_labels.slice(0, this._chart_limit),
                datasets: [{
                    data: this._chart_data,
                    borderColor: this._colorize(),
                    pointRadius: 0,
                    fill: false,
                }]
            },
            options: {
                maintainAspectRatio: false,
                animation: {
                    duration: this.animation,
                },
                scales: {
                    xAxes: [{
                        display: false,
                    }],
                    yAxes: [{
                        display: false,
                        stacked: true,
                        ticks: {
                            beginAtZero: true,
                        },
                        gridLines: {
                            drawOnChartArea: false
                        }
                    }]
                },
                legend: {
                    display: false
                }
            }
        });
    }

    private _update() {
        if (this._destroyed) {
            return;
        }
        if (this._chart) {
            this._chart_data.shift();
            this._chart_data.push(this._read);
            this._read = 0;
            this._chart.update();
        }
    }

    public _ng_read(): string {
        return this._formatLoad(this._readSum);
    }

    public _ng_send(event: any) {
        if (event.target.value) {
            Service.sendMessage(event.target.value, this.port.path).catch((error: Error) => {
                Service.notify('Error', error.message, ENotificationType.error);
            });
        }
        event.target.value = '';
    }

    public _ng_onOptions() {
        Service.addPopup({
            caption: 'Select options for' + this.port.path,
            component: {
                factory: SidebarVerticalPortDialogComponent,
                inputs: {
                    isConnected: this._ng_isConnected,
                    port: this.port,
                    options: this._options,
                    onConnect: (portOptions: IOptions) => {
                        if (this._ng_isConnected) {
                            return;
                        }
                        Service.stopSpy([this._defaultOptions]).then(() => {
                            Service.connect(portOptions).then(() => {
                                this._readSum = 0;
                                this._chart_data = new Array<number>(COptions.STEP);
                                this._chart.config.data.datasets[0].data = this._chart_data;
                                this._options = portOptions;
                                this._ng_isConnected = true;
                                Service.removePopup();
                            }).catch((error: Error) => {
                                Service.notify('Error', `Fail to open port ${this.port.path}: ${error.message}`, ENotificationType.error);
                            });
                        }).catch((err: Error) => {
                            Service.notify('Error', `Fail to stop spy on port ${this.port.path}: ${err.message}`, ENotificationType.error);
                        });
                    },
                    onDisconnect: () => {
                        Service.disconnect(this.port.path).then(() => {
                            this._readSum = 0;
                            this._chart_data = new Array<number>(COptions.STEP);
                            this._chart.config.data.datasets[0].data = this._chart_data;
                            Service.startSpy([this._defaultOptions]).then(() => {
                                this._ng_isConnected = false;
                            });
                            Service.removePopup();
                        }).catch((error: Error) => {
                            Service.notify('Error', `Fail to close port ${this.port.path}: ${error.message}`, ENotificationType.error);
                        });
                    },
                    onReconnect: (portOptions: IOptions) => {
                        Service.disconnect(this.port.path).then(() => {
                            Service.connect(portOptions).then(() => {
                                this._options = portOptions;
                                Service.removePopup();
                            });
                        });
                    }
                }
            },
        });
    }
}
