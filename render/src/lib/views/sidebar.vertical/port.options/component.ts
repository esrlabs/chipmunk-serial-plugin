// tslint:disable:no-inferrable-types

import { Component, Input, AfterViewInit, ViewChild } from '@angular/core';
import { IPortInfo } from '../../../common/interface.portinfo';
import Service from '../../../services/service';
import { Subscription } from 'rxjs';
import { SidebarVerticalPortOptionsWriteComponent } from '../port.options.write/component';
import { IOptions } from '../../../common/interface.options';

@Component({
    selector: 'lib-sb-port-dialog-com',
    templateUrl: './template.html',
    styleUrls: ['./styles.less']
})

export class SidebarVerticalPortDialogComponent implements AfterViewInit {

    @Input() isConnected: boolean;
    @Input() port: IPortInfo;
    @Input() options: IOptions | undefined;
    @Input() onConnect: (portOptions: IOptions) => void;
    @Input() onDisconnect: () => void;
    @Input() onReconnect: (portOptions: IOptions) => void;

    @ViewChild('optionsCom', {static: false}) _optionsCom: SidebarVerticalPortOptionsWriteComponent;

    private _subscriptions: { [key: string]: Subscription } = {};

    public changed = false;

    constructor() { }

    ngAfterViewInit() {
        this._subscriptions.Subscription = this._optionsCom.optionChange.subscribe((status: boolean) => {
            this.changed = status;
        });
    }

    public onCancel() {
        Service.removePopup();
    }

    public getOptions(): IOptions {
        return this._optionsCom.getOptions();
    }
}
