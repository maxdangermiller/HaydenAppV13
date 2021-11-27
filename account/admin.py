from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .forms import CustomUserCreationForm, CustomUserChangeForm
from .models import Account


class CustomUserAdmin(UserAdmin):
    add_form = CustomUserCreationForm
    form = CustomUserChangeForm
    model = Account
    list_display = ('username', 'first_name', 'last_name', 'is_staff', 'is_active',)
    list_filter = ('username', 'first_name', 'last_name', 'is_staff', 'is_active',)
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Authentication', {'fields': ('RFID_code',)}),
        ('Permissions', {'fields': ('is_admin', 'is_staff', 'is_superuser', 'is_active')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'first_name', 'last_name')}
         ),
        ('Authentication', {'fields': ('RFID_code',)}),
        (None, {
            'classes': ('wide',),
            'fields': ('password1', 'password2')}
         ),
        (None, {
            'classes': ('wide',),
            'fields': ('is_admin', 'is_staff', 'is_superuser', 'is_active')}
         ),
    )
    search_fields = ('username',)
    ordering = ('username',)


admin.site.register(Account, CustomUserAdmin)
