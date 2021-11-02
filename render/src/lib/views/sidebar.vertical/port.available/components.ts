// tslint:disable:no-inferrable-types

import * as Toolkit from "chipmunk.client.toolkit";
import {
	Component,
	OnDestroy,
	Input,
	AfterViewInit,
	ViewChild,
	ElementRef,
	ChangeDetectorRef,
	OnInit,
} from "@angular/core";
import { IPortInfo } from "../../../common/interface.portinfo";
import { Chart } from "chart.js";
import { Subscription, Subject } from "rxjs";
import { EHostEvents } from "../../../common/host.events";
import { SidebarVerticalPortDialogComponent } from "../port.options/component";
import { IOptions, CDefaultOptions } from "../../../common/interface.options";
import { ENotificationType } from "chipmunk.client.toolkit";
import { SidebarVerticalPortWarningComponent } from "../port.warning/component";
import Service from "../../../services/service";

interface ISize {
	sidebar_width: number;
	sidebar_height: number;
}

@Component({
	selector: "lib-dia-port-available-com",
	templateUrl: "./template.html",
	styleUrls: ["./styles.less"],
})
export class DialogAvailablePortComponent
	implements OnDestroy, AfterViewInit, OnInit
{
	@Input() port: IPortInfo;
	@Input() observables: {
		tick: Subject<boolean>;
		resize: Subject<{ sidebar_width: number; sidebar_height: number }>;
	};
	@ViewChild("canvas") canvas: ElementRef<HTMLCanvasElement>;

	private _subscriptions: { [key: string]: Subscription } = {};
	private _read: number = 0;
	private _chart: Chart;
	private _limit = 500;
	private _chart_labels = new Array(this._limit).fill("");
	private _destroyed: boolean = false;
	private _options: IOptions | undefined;
	private _defaultOptions: IOptions = Object.assign({}, CDefaultOptions);
	private _sidebar_width: number;
	private _session: string;
	private _logger: Toolkit.Logger = new Toolkit.Logger(
		`Plugin: serial: inj_output_bot:`
	);

	public _ng_isAvailable: boolean;
	public _ng_isConnected: boolean = false;
	public _ng_recent: string[];

	constructor(private _cdRef: ChangeDetectorRef) {}

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
			this._subscribeToTick();
			this._subscribeToResize();
		}
		this._subscribeToEvent();
	}

	private _subscribeToTick() {
		this._subscriptions["tick"] = this.observables.tick.subscribe(
			(tick: boolean) => {
				if (tick) {
					this._update();
				}
				this._forceUpdate();
			}
		);
	}

	private _subscribeToResize() {
		this._subscriptions["resize"] = this.observables.resize.subscribe(
			(size: ISize) => {
				this._sidebar_width = size.sidebar_width;
				const cLimit = Math.ceil(this._sidebar_width / 10);
				Service.setChartLimit(cLimit);
				this._chart.config.data.labels = this._chart_labels.slice(
					0,
					cLimit
				);

				const cSessionPort = Service.getSessionPort(
					this._session,
					this.port.path
				);
				if (cSessionPort) {
					this._chart.config.data.datasets[0].data =
						cSessionPort.sparkline_data.slice(0, cLimit + 1);
				} else {
					this._logger.error(
						"Something went wrong while loading the session"
					);
				}
			}
		);
	}

	private _subscribeToEvent() {
		this._subscriptions["event"] = Service.getObservable().event.subscribe(
			(message: any) => {
				if (
					message.event === EHostEvents.spyState &&
					message.load[this.port.path]
				) {
					this._read = message.load[this.port.path];
				} else if (
					message.event === EHostEvents.state &&
					message.state[this.port.path]
				) {
					this._read = message.state[this.port.path].ioState.read;
				}
			}
		);
	}

	private _unsubscribe() {
		Object.keys(this._subscriptions).forEach((key: string) => {
			this._subscriptions[key].unsubscribe();
		});
	}

	private _loadSession() {
		const cSessionPort = Service.getSessionPort(
			this._session,
			this.port.path
		);
		if (cSessionPort) {
			this._ng_isConnected = cSessionPort.connected;
			this._chart.config.data.datasets[0].data =
				cSessionPort.sparkline_data.slice(
					0,
					Service.getChartLimit() + 1
				);
			this._chart.config.data.labels = this._chart_labels.slice(
				0,
				Service.getChartLimit()
			);

			if (cSessionPort.spying === false) {
				Service.startSpy([this._defaultOptions])
					.then(() => {
						cSessionPort.spying = true;
						Service.setPortAvailable(this.port.path, true);
						this._ng_isAvailable = true;
					})
					.catch((error: Error) => {
						Service.setPortAvailable(this.port.path, false);
						this._ng_isAvailable = false;
						this._logger.error(error.message);
					});
				this._forceUpdate();
			}
		} else {
			this._logger.error(
				"Something went wrong while loading the session"
			);
		}
	}

	private _formatLoad(load: number): string {
		let read: string = "";
		if (load > 1024 * 1024 * 1024) {
			read = (load / 1024 / 1024 / 1024).toFixed(2) + " Gb";
		} else if (load > 1024 * 1024) {
			read = (load / 1024 / 1024).toFixed(2) + " Mb";
		} else if (load > 1024) {
			read = (load / 1024).toFixed(2) + " Kb";
		} else {
			read = load + " b";
		}
		return read;
	}

	private _createChart() {
		const cSessionPort = Service.getSessionPort(
			this._session,
			this.port.path
		);
		if (cSessionPort) {
			const cSparklineData = cSessionPort.sparkline_data;
			this._chart = new Chart(
				this.canvas.nativeElement.getContext("2d"),
				{
					type: "line",
					data: {
						labels: this._chart_labels.slice(
							0,
							Service.getChartLimit()
						),
						datasets: [
							{
								data: cSparklineData.slice(
									cSparklineData.length -
										Service.getChartLimit()
								),
								borderColor: Service.getPortColor(
									this.port.path
								),
								pointRadius: 0,
								fill: false,
							},
						],
					},
					options: {
						maintainAspectRatio: false,
						animation: {
							duration: 5000,
						},
						scales: {
							y: {
								stacked: true,
								beginAtZero: true,
								display: false,
							},
							x: {
								stacked: true,
								display: false,
							},
						},
					},
				}
			);
		} else {
			this._logger.error(
				"Something went wrong with the SessionPort entry while creating the sparkline"
			);
		}
	}

	private _update() {
		if (this._destroyed) {
			return;
		}
		if (this._chart && Service.getSessions()) {
			Service.getSessions().forEach((session: string) => {
				Service.updateSparkline(session, this.port.path, this._read);
			});

			const cData = this._chart.config.data.datasets[0].data;
			cData.pop();
			cData.unshift(this._read);

			this._read = 0;
			this._chart.update();
		}
	}

	public _ng_read(): string {
		const cSessionPort = Service.getSessionPort(
			this._session,
			this.port.path
		);
		if (cSessionPort && cSessionPort.read !== undefined) {
			return this._formatLoad(cSessionPort.read);
		} else {
			return "0 b";
		}
	}

	public _ng_send(event: any) {
		if (event.target.value) {
			Service.sendMessage(event.target.value, this.port.path).catch(
				(error: Error) => {
					Service.notify(
						"Error",
						error.message,
						ENotificationType.error
					);
				}
			);
		}
		event.target.value = "";
	}

	public _ng_onWarning() {
		Service.addPopup({
			caption: `Error while accessing ${this.port.path}`,
			component: {
				factory: SidebarVerticalPortWarningComponent,
				inputs: {
					port: this.port,
				},
			},
		});
	}

	public _ng_loadCommands() {
		this._ng_recent = Service.getCommands();
	}

	public _ng_onOptions() {
		this._options = Service.getSettings(this.port.path);
		Service.addPopup({
			caption: "Select options for " + this.port.path,
			component: {
				factory: SidebarVerticalPortDialogComponent,
				inputs: {
					isConnected: this._ng_isConnected,
					port: this.port,
					options: this._options,
					onConnect: (portOptions: IOptions) => {
						if (this._ng_isConnected) {
							this._logger.error(
								`The port ${portOptions.path} is already connected!`
							);
							return;
						}
						Service.stopSpy([this._defaultOptions])
							.then(() => {
								Service.connect(portOptions)
									.then(() => {
										this._options = portOptions;
										this._ng_isConnected = true;

										const cSessionPort =
											Service.getSessionPort(
												this._session,
												this.port.path
											);
										if (cSessionPort) {
											cSessionPort.connected =
												this._ng_isConnected;
											cSessionPort.spying = false;
											cSessionPort.read = 0;
										} else {
											this._logger.error(
												"Something went wrong with the SessionPort entry when connecting"
											);
										}
										Service.removePopup();
									})
									.catch((error: Error) => {
										Service.notify(
											"Error",
											error.message,
											ENotificationType.error
										);
									});
							})
							.catch((err: Error) => {
								Service.notify(
									"Error",
									err.message,
									ENotificationType.error
								);
							});
					},
					onDisconnect: () => {
						Service.disconnect(this.port.path)
							.then(() => {
								this._ng_isConnected = false;
								Service.startSpy([this._defaultOptions])
									.then(() => {
										const cSessionPort =
											Service.getSessionPort(
												this._session,
												this.port.path
											);
										if (cSessionPort) {
											cSessionPort.spying = true;
											cSessionPort.read = 0;
											cSessionPort.connected =
												this._ng_isConnected;
										} else {
											this._logger.error(
												"Something went wrong with the SessionPort entry when disconnecting"
											);
										}
										Service.setPortAvailable(
											this.port.path,
											true
										);
										this._ng_isAvailable = true;
									})
									.catch((error: Error) => {
										Service.setPortAvailable(
											this.port.path,
											false
										);
										this._ng_isAvailable = false;
										this._logger.error(error.message);
									});
								this._forceUpdate();
								Service.removePopup();
							})
							.catch((error: Error) => {
								Service.notify(
									"Error",
									error.message,
									ENotificationType.error
								);
							});
					},
					onReconnect: (portOptions: IOptions) => {
						Service.disconnect(this.port.path)
							.then(() => {
								Service.connect(portOptions)
									.then(() => {
										this._options = portOptions;
										Service.removePopup();
									})
									.catch((error: Error) => {
										Service.notify(
											"Error",
											error.message,
											ENotificationType.error
										);
									});
							})
							.catch((error: Error) => {
								Service.notify(
									"Error",
									error.message,
									ENotificationType.error
								);
							});
					},
				},
			},
		});
	}
}
