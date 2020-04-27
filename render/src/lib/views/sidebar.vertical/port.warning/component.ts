// tslint:disable:no-inferrable-types

import { Component, Input } from '@angular/core';
import { IPortInfo } from '../../../common/interface.portinfo';

@Component ({
    selector: 'lib-sb-port-warn-com',
    templateUrl: './template.html',
    styleUrls: ['./styles.less']
})

export class SidebarVerticalPortWarningComponent {

    @Input() port: IPortInfo;

    constructor() { }
}
