from django import template
from main.models import NewDisplayConfig

register = template.Library()


def configEdit(configVal, display_id):
    config = NewDisplayConfig.objects.all()[int(display_id) - 1]

    if not config:
        return configVal
    
    return config.name



register.filter('configEdit', configEdit)
