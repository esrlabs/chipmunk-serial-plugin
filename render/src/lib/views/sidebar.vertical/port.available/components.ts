// tslint:disable:no-inferrable-types

import { Component, OnDestroy, Input, AfterViewInit, ViewChildren, QueryList, ElementRef, ChangeDetectorRef, OnInit } from '@angular/core';
import { IPortInfo, IPortState } from '../../../common/interface.portinfo';
import Chart from 'chart.js';
import { Subscription, Subject } from 'rxjs';
import Service, { IPort } from '../../../services/service';
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

const LIMIT = 300;
const ANIMATION = 5000;

@Component({
    selector: 'lib-dia-port-available-com',
    templateUrl: './template.html',
    styleUrls: ['./styles.less']
})

export class DialogAvailablePortComponent implements OnDestroy, AfterViewInit, OnInit {

    @Input() port: IPortInfo;
    @Input() observables: {tick: Subject<boolean>, resize: Subject<{ sidebar_width: number, sidebar_height: number }>};

    @ViewChildren('canvas') canvases: QueryList<ElementRef>;

    private _subscriptions: { [key: string]: Subscription } = {};
    private _canvas: ElementRef<HTMLCanvasElement>;
    private _ctx: any;
    private _read: number = 0;
    private _chart: Chart;
    private _chart_label_limit: number;
    private _chart_data_limit = 30;
    private _chart_labels = new Array(LIMIT).fill('');
    private _destroyed: boolean = false;
    private _options: IOptions;
    private _defaultOptions: IOptions = Object.assign({}, CDefaultOptions);
    private _sidebar_width: number;
    private _session: string;

    public _ng_isConnected: boolean = false;

    constructor(private _cdRef: ChangeDetectorRef) {
    }

    ngAfterViewInit() {
        this._createChart();
        this._loadSession();
        this._subscriptions.Subscription = this.observables.tick.subscribe((tick: boolean) => {
            if (tick) {
                this._update();
            }
            this._forceUpdate();
        });

        this._subscriptions.Subscription = this.observables.resize.subscribe((size: any) => {
            this._sidebar_width = size.sidebar_width;
            this._chart_label_limit = Math.ceil(this._sidebar_width / 10);
            this._chart.config.data.labels = this._chart_labels.slice(0, this._chart_label_limit);

            this._chart_data_limit = Math.ceil(this._sidebar_width / 10);

            console.log(this._chart.data.labels);
            console.log(this._chart.data.datasets[0].data);
        });

        this._subscriptions.Subscription = Service.getObservable().event.subscribe((message: any) => {
            if (message.event === EHostEvents.spyState && message.load[this.port.path]) {
                this._read = message.load[this.port.path];
            } else if (message.event === EHostEvents.state && message.state[this.port.path]) {
                this._read = message.state[this.port.path].ioState.read;
            }
        });
    }

    ngOnInit() {
        this._session = Service.getSessionID();
        this._defaultOptions.path = this.port.path;
    }

    ngOnDestroy() {
        const cSessionPort = this._getSessionPort();
        if (cSessionPort) {
            cSessionPort.limit = this._chart_data_limit;
        } else {
            console.error('Something went wrong with the SessionPort entry');
        }

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
        const cSessionPort = this._getSessionPort();
        if (cSessionPort) {
            this._chart_data_limit = cSessionPort.limit;
            this._ng_isConnected = cSessionPort.connected;

            this._chart.config.data.datasets[0].data = cSessionPort.sparkline_data.slice(LIMIT - this._chart_data_limit);

            if (cSessionPort.spying === false) {
                Service.startSpy([this._defaultOptions]).then(() => {
                    cSessionPort.spying = true;
                }).catch((error: Error) => {
                    Service.notify('Error', `Error occurred while starting to spy: ${error.message}`, ENotificationType.error);
                });
            }
        } else {
            console.error('Something went wrong while loading the session');
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
        this._canvas = this.canvases.find(canvas => canvas.nativeElement.id === `canvas_${this.port.path}`);
        this._ctx = this._canvas.nativeElement.getContext('2d');
        if (this._chart_label_limit === undefined) {
            this._chart_label_limit = this._canvas.nativeElement.width / 10;
        }
        const cSessionPort = this._getSessionPort();
        if (cSessionPort) {
            this._chart = new Chart(this._ctx, {
                type: 'line',
                data: {
                    labels: this._chart_labels.slice(0, this._chart_label_limit),
                    datasets: [{
                        data: cSessionPort.sparkline_data.slice(LIMIT - this._chart_data_limit),
                        borderColor: this._colorize(),
                        pointRadius: 0,
                        fill: false,
                    }]
                },
                options: {
                    maintainAspectRatio: false,
                    animation: {
                        duration: ANIMATION,
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
        } else {
            console.error('Something went wrong with the SessionPort entry');
        }
    }

    private _getSessionPort(): IPort {
        const cSessionPort = Service.sessionPort[this._session];
        if (cSessionPort && cSessionPort[this.port.path]) {
            return cSessionPort[this.port.path];
        }
        return null;
    }

    private _update() {
        if (this._destroyed) {
            return;
        }
        if (this._chart) {
            const cSessionPort = this._getSessionPort();
            if (cSessionPort) {
                cSessionPort.read += this._read;
                cSessionPort.sparkline_data.shift();
                cSessionPort.sparkline_data.push(this._read);
            } else {
                console.error('Something went wrong with the SessionPort entry');
            }

            const cData = this._chart.config.data.datasets[0].data;
            cData.shift();
            cData.push(this._read);

            this._read = 0;
            this._chart.update();
        }
    }

    public _ng_read(): string {
        return this._formatLoad(Service.sessionPort[this._session][this.port.path].read);
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

                                this._options = portOptions;
                                this._ng_isConnected = true;

                                const cSessionPort = this._getSessionPort();
                                if (cSessionPort) {
                                    cSessionPort.connected = this._ng_isConnected;
                                    cSessionPort.spying = false;
                                    cSessionPort.read = 0;
                                } else {
                                    console.error('Something went wrong with the SessionPort entry');
                                }
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
                            this._ng_isConnected = false;
                            Service.startSpy([this._defaultOptions]).then(() => {
                                const cSessionPort = this._getSessionPort();
                                if (cSessionPort) {
                                    cSessionPort.spying = true;
                                    cSessionPort.read = 0;
                                } else {
                                    console.error('Something went wrong with the SessionPort entry');
                                }
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
