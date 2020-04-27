// tslint:disable:no-inferrable-types

import { Component, OnDestroy, Input, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef, OnInit } from '@angular/core';
import { IPortInfo } from '../../../common/interface.portinfo';
import Chart from 'chart.js';
import { Subscription, Subject } from 'rxjs';
import Service, { IPort } from '../../../services/service';
import { EHostEvents } from '../../../common/host.events';
import { SidebarVerticalPortDialogComponent } from '../port.options/component';
import { IOptions, CDefaultOptions } from '../../../common/interface.options';
import { ENotificationType } from 'chipmunk.client.toolkit';
import { SidebarVerticalPortWarningComponent } from '../port.warning/component';

const LIMIT = 500;

@Component({
    selector: 'lib-dia-port-available-com',
    templateUrl: './template.html',
    styleUrls: ['./styles.less']
})

export class DialogAvailablePortComponent implements OnDestroy, AfterViewInit, OnInit {

    @Input() port: IPortInfo;
    @Input() observables: {tick: Subject<boolean>, resize: Subject<{ sidebar_width: number, sidebar_height: number }>};
    @ViewChild('canvas') canvas: ElementRef<HTMLCanvasElement>;

    private _subscriptions: { [key: string]: Subscription } = {};
    private _ctx: any;
    private _read: number = 0;
    private _chart: Chart;
    private _chart_labels = new Array(LIMIT).fill('');
    private _destroyed: boolean = false;
    private _options: IOptions;
    private _defaultOptions: IOptions = Object.assign({}, CDefaultOptions);
    private _sidebar_width: number;
    private _session: string;

    public _ng_isAvailable: boolean;
    public _ng_isConnected: boolean = false;

    constructor(private _cdRef: ChangeDetectorRef) {
    }

    ngAfterViewInit() {
        if (Service.getPortAvailable(this.port.path)) {
            this._createChart();
            this._loadSession();
        }
        this._subscribe();
    }

    ngOnInit() {
        this._session = Service.getSessionID();
        this._defaultOptions.path = this.port.path;
        this._ng_isAvailable = Service.getPortAvailable(this.port.path);
    }

    ngOnDestroy() {
        if (this._chart) {
            this._chart.destroy();
            this._chart = undefined;
        }
        this._unsubscribe();
        this._destroyed = true;
    }

    private _forceUpdate() {
        if (this._destroyed) {
            return;
        }
        this._cdRef.detectChanges();
    }

    private _subscribe() {
        if (Service.getPortAvailable(this.port.path)) {
            this._subscribeToTick('tick');
            this._subscribeToResize('resize');
        }
        this._subscribeToEvent('event');
    }

    private _subscribeToTick(key: string) {
        this._subscriptions[key] = this.observables.tick.subscribe((tick: boolean) => {
            if (tick) {
                this._update();
            }
            this._forceUpdate();
        });
    }

    private _subscribeToResize(key: string) {
        this._subscriptions[key] = this.observables.resize.subscribe((size: any) => {

            this._sidebar_width = size.sidebar_width;
            Service.chart_limit = Math.ceil(this._sidebar_width / 10);
            this._chart.config.data.labels = this._chart_labels.slice(0, Service.chart_limit);

            const cSessionPort = this._getSessionPort();
            if (cSessionPort) {
                this._chart.config.data.datasets[0].data = cSessionPort.sparkline_data.slice(0, Service.chart_limit + 1);
            } else {
                console.error('Something went wrong while loading the session');
            }
        });
    }

    private _subscribeToEvent(key: string) {
        this._subscriptions[key] = Service.getObservable().event.subscribe((message: any) => {
            if (message.event === EHostEvents.spyState && message.load[this.port.path]) {
                this._read = message.load[this.port.path];
            } else if (message.event === EHostEvents.state && message.state[this.port.path]) {
                this._read = message.state[this.port.path].ioState.read;
            }
        });
    }

    private _unsubscribe() {
        Object.keys(this._subscriptions).forEach((key: string) => {
            this._subscriptions[key].unsubscribe();
        });
    }

    private _loadSession() {
        const cSessionPort = this._getSessionPort();
        this._chart.config.options.animation.duration = 5000;
        if (cSessionPort) {
            this._ng_isConnected = cSessionPort.connected;
            this._chart.config.data.datasets[0].data = cSessionPort.sparkline_data.slice(0, Service.chart_limit + 1);
            this._chart.config.data.labels = this._chart_labels.slice(0, Service.chart_limit);

            if (cSessionPort.spying === false) {
                Service.startSpy([this._defaultOptions]).then(() => {
                    cSessionPort.spying = true;
                    Service.setPortAvailable(this.port.path, true);
                    this._ng_isAvailable = true;
                }).catch((error: Error) => {
                    Service.setPortAvailable(this.port.path, false);
                    this._ng_isAvailable = false;
                    console.log(error.message);
                });
                this._forceUpdate();
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

    private _createChart() {
        this._ctx = this.canvas.nativeElement.getContext('2d');
        const cSessionPort = this._getSessionPort();
        if (cSessionPort) {
            const cSparklineData = cSessionPort.sparkline_data;
            this._chart = new Chart(this._ctx, {
                type: 'line',
                data: {
                    labels: this._chart_labels.slice(0, Service.chart_limit),
                    datasets: [{
                        data: cSparklineData.slice(cSparklineData.length - Service.chart_limit),
                        borderColor: Service.getPortColor(this.port.path),
                        pointRadius: 0,
                        fill: false,
                    }]
                },
                options: {
                    maintainAspectRatio: false,
                    animation: {
                        duration: 0
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
                cSessionPort.sparkline_data.pop();
                cSessionPort.sparkline_data.unshift(this._read);
            } else {
                console.error('Something went wrong with the SessionPort entry');
            }

            const cData = this._chart.config.data.datasets[0].data;
            cData.pop();
            cData.unshift(this._read);

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

    public _ng_onWarning() {
        Service.addPopup({
            caption: `Error while accessing ${this.port.path}`,
            component: {
                factory: SidebarVerticalPortWarningComponent,
                inputs: {
                    port: this.port
                }
            }
        });
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
                                Service.notify('Error', error.message, ENotificationType.error);
                            });
                        }).catch((err: Error) => {
                            Service.notify('Error', err.message, ENotificationType.error);
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
                                    cSessionPort.connected = this._ng_isConnected;
                                } else {
                                    console.error('Something went wrong with the SessionPort entry');
                                }
                                Service.setPortAvailable(this.port.path, true);
                                this._ng_isAvailable = true;
                            }).catch((error: Error) => {
                                Service.setPortAvailable(this.port.path, false);
                                this._ng_isAvailable = false;
                                console.log(error.message);
                            });
                            this._forceUpdate();
                            Service.removePopup();
                        }).catch((error: Error) => {
                            Service.notify('Error', error.message, ENotificationType.error);
                        });
                    },
                    onReconnect: (portOptions: IOptions) => {
                        Service.disconnect(this.port.path).then(() => {
                            Service.connect(portOptions).then(() => {
                                this._options = portOptions;
                                Service.removePopup();
                            }).catch((error: Error) => {
                                Service.notify('Error', error.message, ENotificationType.error);
                            });
                        }).catch((error: Error) => {
                            Service.notify('Error', error.message, ENotificationType.error);
                        });
                    }
                }
            },
        });
    }
}
