import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SidebarVerticalComponent } from './views/sidebar.vertical/component';
import { SidebarVerticalPortInfoComponent } from './views/sidebar.vertical/port.listed/component';
import { SidebarVerticalPortConnectedComponent } from './views/sidebar.vertical/port.connected/component';
import { SidebarVerticalPortOptionsReadComponent } from './views/sidebar.vertical/port.options.read/component';
import { SidebarVerticalPortOptionsWriteComponent } from './views/sidebar.vertical/port.options.write/component';
import { DialogAvailablePortComponent } from './views/sidebar.vertical/port.available/components';
import { SidebarVerticalPortDialogComponent } from './views/sidebar.vertical/port.options/component';
import { SerialRowComponent } from './views/row/component';
import { PrimitiveModule } from 'chipmunk-client-material';
import * as Toolkit from 'chipmunk.client.toolkit';

import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatOptionModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSliderModule } from '@angular/material/slider';
import { MatSortModule } from '@angular/material/sort';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTableModule } from '@angular/material/table';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';

export {
    SidebarVerticalComponent,
    SidebarVerticalPortInfoComponent,
    SidebarVerticalPortConnectedComponent,
    SidebarVerticalPortOptionsReadComponent,
    SidebarVerticalPortOptionsWriteComponent,
    SidebarVerticalPortDialogComponent,
    SerialRowComponent,
    DialogAvailablePortComponent
};

const Material = [
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatOptionModule,
    MatSortModule,
    MatProgressBarModule,
    MatCheckboxModule,
    MatButtonModule,
    MatSelectModule,
    MatExpansionModule,
    MatSliderModule,
    MatTableModule,
    MatListModule,
    MatIconModule
];

const CComponents = [
    SidebarVerticalComponent,
    SidebarVerticalPortInfoComponent,
    SidebarVerticalPortConnectedComponent,
    SidebarVerticalPortOptionsReadComponent,
    SidebarVerticalPortOptionsWriteComponent,
    SidebarVerticalPortDialogComponent,
    SerialRowComponent,
    DialogAvailablePortComponent,
];

@NgModule({
    entryComponents: [ ...CComponents ],
    declarations: [ ...CComponents ],
    imports: [ CommonModule, FormsModule, PrimitiveModule, ReactiveFormsModule, ...Material ],
    exports: [ ...CComponents ]
})

export class PluginModule extends Toolkit.PluginNgModule {

    constructor() {
        super('Serial Ports', 'Provides accees to local serial ports');
    }

}
