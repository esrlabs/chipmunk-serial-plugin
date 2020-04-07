// tslint:disable:no-inferrable-types

import { Component, OnDestroy, ChangeDetectorRef, AfterContentInit, Input, Output, EventEmitter } from '@angular/core';
import { IOptions } from '../../../common/interface.options';
import * as Toolkit from 'chipmunk.client.toolkit';
import { FormControl, Validators } from '@angular/forms';
import { IPortOptions } from '../../../common/interface.options';

@Component({
    selector: 'lib-sb-port-options-write-com',
    templateUrl: './template.html',
    styleUrls: ['./styles.less']
})

export class SidebarVerticalPortOptionsWriteComponent implements AfterContentInit, OnDestroy {

    @Input() path: string;
    @Input() options: IOptions;

    @Output() optionChange: EventEmitter<boolean> = new EventEmitter();

    private _subscriptions: { [key: string]: Toolkit.Subscription } = {};
    private _destroyed: boolean = false;

    public highWaterMark: number = 65536;
    public lock: boolean = false;
    public rtscts: boolean = false;
    public xon: boolean = false;
    public xoff: boolean = false;
    public xany: boolean = false;
    public baudRate: IPortOptions['baudRate'] = 921600;
    public stopBits: IPortOptions['stopBits'] = 1;
    public parity: IPortOptions['parity'] = 'none';
    public dataBits: IPortOptions['dataBits'] = 8;
    public encoding: IOptions['reader']['encoding'] = 'utf8';
    public delimiter: IOptions['reader']['delimiter'] = '\\n';
    public baudRatePlaceholder: string = this.baudRate.toString();
    public custom: boolean = false;

    public baudRateInput = new FormControl('', [
        Validators.required,
        Validators.pattern(/^[0-9]\d*$/),
    ]);
    public _ng_baudrateItems: Array<{ caption: string, value: any, }> = [
        { caption: 'custom', value: -1 },
        { caption: '110', value: 110 },
        { caption: '300', value: 300 },
        { caption: '1200', value: 1200 },
        { caption: '2400', value: 2400 },
        { caption: '4800', value: 4800 },
        { caption: '9600', value: 9600 },
        { caption: '14400', value: 14400 },
        { caption: '19200', value: 19200 },
        { caption: '38400', value: 38400 },
        { caption: '57600', value: 57600 },
        { caption: '115200', value: 115200 },
        { caption: '921600', value: 921600 },
    ];
    public _ng_databitsItems: Array<{ caption: string, value: any, }> = [
        { caption: '8', value: 8 },
        { caption: '7', value: 7 },
        { caption: '6', value: 6 },
        { caption: '5', value: 5 },
    ];
    public _ng_stopbitsItems: Array<{ caption: string, value: any, }> = [
        { caption: '1', value: 1 },
        { caption: '2', value: 2 },
    ];
    public _ng_parityItems: Array<{ caption: string, value: any, }> = [
        { caption: 'none', value: 'none' },
        { caption: 'even', value: 'even' },
        { caption: 'mark', value: 'mark' },
        { caption: 'odd', value: 'odd' },
        { caption: 'space', value: 'space' },
    ];
    public _ng_encodingItems: Array<{ caption: string, value: any, }> = [
        { caption: 'ascii', value: 'ascii' },
        { caption: 'utf8', value: 'utf8' },
        { caption: 'utf16le', value: 'utf16le' },
        { caption: 'ucs2', value: 'ucs2' },
        { caption: 'base64', value: 'base64' },
        { caption: 'binary', value: 'binary' },
        { caption: 'hex', value: 'hex' },
        { caption: 'undefined', value: undefined },
    ];

    constructor(private _cdRef: ChangeDetectorRef) {
        this._ng_onBRChange = this._ng_onBRChange.bind(this);
    }

    ngOnDestroy() {
        this.optionChange.emit(false);
        this._destroyed = true;
        Object.keys(this._subscriptions).forEach((key: string) => {
            this._subscriptions[key].unsubscribe();
        });
    }

    ngAfterContentInit() {
        if (this.options) {
            this._setOptions(this.options);
        }
        if (typeof this.delimiter === 'string') {
            this.delimiter = this.delimiter.replace(/\n/gi, '\\n').replace(/\r/gi, '\\r').replace(/\t/gi, '\\t');
        }
    }

    public _ng_onBRChange() {
        if (this.baudRate === -1) {
            this.custom = true;
        } else {
            this.custom = false;
        }
        this._forceUpdate();
    }

    public _ng_change() {
        this.optionChange.emit(true);
    }

    public getOptions(): IOptions {
        return {
            path: this.path,
            options: {
                baudRate: this.baudRate === -1 ? Number(this.baudRateInput.value) : this.baudRate,
                lock: this.lock,
                parity: this.parity,
                dataBits: this.dataBits,
                xany: this.xany,
                xoff: this.xoff,
                xon: this.xon,
                rtscts: this.rtscts,
                highWaterMark: this.highWaterMark,
                stopBits: this.stopBits,
            },
            reader: {
                encoding: this.encoding,
                delimiter: this._getDelimiter(),
                includeDelimiter: false
            }
        };
    }

    private _setOptions(options: IOptions) {
        const cBaudRate = options.options.baudRate;

        if (this._ng_baudrateItems.find(item => item.value === cBaudRate)) {
            this.baudRate = cBaudRate;
        } else {
            this.custom = true;
            this.baudRate = -1;
            this.baudRateInput.setValue(cBaudRate);
        }

        this.dataBits = options.options.dataBits;

        this.stopBits = options.options.stopBits;

        this.parity = options.options.parity;

        this.encoding = options.reader.encoding;

        this.highWaterMark = options.options.highWaterMark;
        this.delimiter = options.reader.delimiter;

        this.lock = options.options.lock;
        this.rtscts = options.options.rtscts;
        this.xon = options.options.xon;
        this.xoff = options.options.xoff;
        this.xany = options.options.xany;
    }

    private _getDelimiter(): string {
        const delimiter: string | number[] = this.delimiter;
        return `${delimiter}`.replace(/\\n/gi, '\n').replace(/\\r/gi, '\r').replace(/\\t/gi, '\t');
    }

    private _forceUpdate() {
        if (this._destroyed) {
            return;
        }
        this._cdRef.detectChanges();
    }

}
